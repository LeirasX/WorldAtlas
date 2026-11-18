import { defineConfig, devices } from '@playwright/test'

const liveUrl = process.env.WORLDATLAS_TEST_URL
const research = process.env.WORLDATLAS_TEST_LOCAL === '1'

export default defineConfig({
  testDir: './tests',
  testMatch: research ? '**/research.spec.ts' : '**/atlas.spec.ts',
  use: { baseURL: liveUrl ?? 'http://127.0.0.1:4173/WorldAtlas/' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 15'], defaultBrowserType: 'chromium' } },
  ],
  webServer: liveUrl ? undefined : {
    command: `npm run preview -- ${research ? '--outDir dist-local' : ''} --host 127.0.0.1 --port 4173 --strictPort --base /WorldAtlas/`,
    url: 'http://127.0.0.1:4173/WorldAtlas/',
  },
})
