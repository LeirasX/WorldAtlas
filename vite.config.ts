import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDataset, type Metrics } from './src/data.ts'

export default defineConfig(({ mode }) => {
  const publicData = mode === 'pages' || mode === 'public' || process.env.WORLDATLAS_PUBLIC === '1'
  const offline = mode !== 'native' && process.env.WORLDATLAS_OFFLINE !== '0'
  return {
    build: {
      outDir: mode === 'native' ? 'dist-native' : mode === 'private' ? 'dist-local' : 'dist',
      rollupOptions: { output: { manualChunks: id => /\/Data\/(local|public)\/[^/]+\.csv/.test(id) ? 'country-data' : undefined } },
    },
    base: mode === 'pages' ? process.env.WORLDATLAS_BASE ?? '/WorldAtlas/' : './',
    define: { __ATLAS_OFFLINE__: JSON.stringify(offline) },
    server: {
      port: 1420,
      strictPort: true,
      host: process.env.TAURI_DEV_HOST || '127.0.0.1',
    },
    plugins: [{
      name: 'atlas-dataset',
      buildStart() {
        if (mode === 'development') return
        const registry = JSON.parse(readFileSync('Data/metrics.json', 'utf8')) as Metrics
        const read = (dir: string) => readdirSync(dir).filter(name => name.endsWith('.csv'))
          .map(name => ({ name, text: readFileSync(resolve(dir, name), 'utf8') }))
        const approved = loadDataset(read('Data/public'), registry, true)
        if (!publicData && existsSync('Data/local') && readdirSync('Data/local').some(name => name.endsWith('.csv'))) {
          const local = loadDataset(read('Data/local'), registry, true)
          const ids = new Set(approved.countries.map(country => country.id))
          if (local.countries.some(country => !ids.has(country.id))) throw new Error('Local country IDs differ from the public registry.')
        }
      },
      resolveId(id) { if (id === 'virtual:atlas-data') return '\0virtual:atlas-data' },
      load(id) {
        if (id !== '\0virtual:atlas-data') return
        return `export const publicFiles = import.meta.glob('/Data/public/*.csv', { query: '?raw', import: 'default', eager: true })
          export const localFiles = ${publicData ? '{}' : "import.meta.glob('/Data/local/*.csv', { query: '?raw', import: 'default', eager: true })"}`
      },
      handleHotUpdate({ file, server }) {
        if (!publicData && file.includes('/Data/local/') && file.endsWith('.csv')) {
          server.ws.send({ type: 'full-reload' })
        }
      },
    }, {
      name: 'offline-atlas',
      apply: 'build',
      generateBundle(_, bundle) {
        if (!offline) return
        const localAssets = ['world-map.json', 'atlas-192.png', 'atlas-512.png']
        const hash = createHash('sha256').update(readFileSync('index.html'))
        for (const [name, item] of Object.entries(bundle).sort()) {
          hash.update(name).update(item.type === 'asset' ? item.source : item.code)
        }
        for (const name of localAssets) hash.update(readFileSync(resolve('public', name)))
        this.emitFile({
          type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({
            name: 'WorldAtlas', short_name: 'WorldAtlas', id: './', start_url: './', scope: './',
            display: 'standalone', background_color: '#f5f6fa', theme_color: '#1d3261',
            icons: [192, 512].map(size => ({
              src: `atlas-${size}.png`, sizes: `${size}x${size}`, type: 'image/png',
            })),
          }),
        })
        const assets = [...new Set(['index.html', ...Object.keys(bundle), ...localAssets])]
        this.emitFile({
          type: 'asset', fileName: 'sw.js',
          source: `
const scope = self.registration.scope
const prefix = 'worldatlas:' + scope + ':'
const key = prefix + ${JSON.stringify(hash.digest('hex').slice(0, 16))}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(key).then(cache => cache.addAll(${JSON.stringify(assets)}.map(path => new URL(path, scope)))))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(item => item.startsWith(prefix) && item !== key).map(item => caches.delete(item)))))
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(scope)) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(key).then(cache => cache.match(new URL('index.html', scope)))))
    return
  }
  event.respondWith(caches.open(key).then(cache => cache.match(event.request, { ignoreVary: true })).then(response => response || fetch(event.request)))
})
  `,
        })
      },
    }],
  }
})
