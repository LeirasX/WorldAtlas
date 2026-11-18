import { loadDataset, type DataFile, type Dataset, type Metrics } from './data.ts'

import { publicFiles, localFiles } from 'virtual:atlas-data'

declare const __ATLAS_OFFLINE__: boolean
export const native = '__TAURI_INTERNALS__' in window
export const desktop = native && !/Android|iPhone|iPad|iPod/.test(navigator.userAgent)
  && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const cacheKey = 'worldatlas:import:v1'

export function bundledData(metrics: Metrics) {
  const unpack = (files: Record<string, string>) => Object.entries(files)
    .map(([name, text]) => ({ name: name.split('/').at(-1)!, text }))
  const approved = loadDataset(unpack(publicFiles), metrics, true)
  if (!Object.keys(localFiles).length) return { dataset: approved, warning: '' }
  try { return { dataset: validate(unpack(localFiles), metrics, approved), warning: '' } }
  catch (error) { return { dataset: approved, warning: `Local dataset skipped. ${String(error)}` } }
}

function validate(files: DataFile[], metrics: Metrics, fallback: Dataset) {
  const dataset = loadDataset(files, metrics, true)
  const expected = new Set(fallback.countries.map(country => country.id))
  if (dataset.countries.some(country => !expected.has(country.id))) throw new Error('Country IDs differ from the bundled registry.')
  return dataset
}

export function currentData(metrics: Metrics, fallback: Dataset) {
  try {
    const files = localStorage.getItem(cacheKey)
    if (files) return validate(JSON.parse(files), metrics, fallback)
  } catch { /* A stale or unavailable cache still leaves the bundled data usable. */ }
  return fallback
}

export function importData(files: DataFile[], metrics: Metrics, fallback: Dataset) {
  const dataset = validate(files, metrics, fallback)
  try {
    localStorage.setItem(cacheKey, JSON.stringify(files))
    return { dataset, persistent: true }
  } catch {
    return { dataset, persistent: false }
  }
}

export function resetData() {
  try { localStorage.removeItem(cacheKey) } catch { /* Storage can be disabled by the browser. */ }
}

export async function desktopFolder(select = false) {
  if (!desktop) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<DataFile[] | null>(select ? 'select_atlas_folder' : 'read_atlas_folder')
}

export async function forgetDesktopFolder() {
  if (!desktop) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('forget_atlas_folder')
}

export function installOfflineSupport() {
  if (native || !import.meta.env.PROD || !__ATLAS_OFFLINE__) return
  const base = new URL(import.meta.env.BASE_URL, document.baseURI)
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = new URL('manifest.webmanifest', base).href
  document.head.append(manifest)
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(new URL('sw.js', base)).catch(() => {
    // Browsing remains available if the browser disallows service workers.
  })
}
