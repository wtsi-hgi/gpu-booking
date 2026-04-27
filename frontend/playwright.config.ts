import path from 'node:path'

import { defineConfig } from '@playwright/test'

const repoRoot = path.resolve(__dirname, '..')
const scratchDir = path.join(repoRoot, '.tmp', 'agent', 'playwright')
const databasePath = path.join(scratchDir, 'gpu-booking-e2e.sqlite3')
const outputDir = path.join(scratchDir, 'test-results')
const htmlReportDir = path.join(scratchDir, 'playwright-report')
const frontendPort = 3100
const backendPort = 8100
const playwrightBackendUrl =
  process.env.PLAYWRIGHT_BACKEND_URL ?? `http://127.0.0.1:${backendPort}`
const playwrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
const shellQuote = (value: string): string => JSON.stringify(value)
const frontendServerCommand = [
  'cd frontend',
  `pnpm exec next dev -H 0.0.0.0 -p ${frontendPort}`,
].join(' && ')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  outputDir,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: htmlReportDir }]],
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: `mkdir -p ${scratchDir} && rm -f ${databasePath} ${databasePath}-shm ${databasePath}-wal && cd backend && BACKEND_PORT=${backendPort} ./run_uvicorn.sh`,
      cwd: repoRoot,
      env: {
        ...process.env,
        GPU_BOOKING_AUTH_MODE: 'insecure',
        GPU_BOOKING_BACKEND_PORT: String(backendPort),
        GPU_BOOKING_DATABASE_URL: `sqlite+aiosqlite:////${databasePath.replace(/^\//, '')}`,
        GPU_BOOKING_INITIAL_ADMIN_EMAILS: 'admin@example.com',
        AUTH_MODE: 'insecure',
        BACKEND_PORT: String(backendPort),
        DATABASE_URL: `sqlite+aiosqlite:////${databasePath.replace(/^\//, '')}`,
        INITIAL_ADMIN_EMAILS: 'admin@example.com',
        PLAYWRIGHT_BACKEND_URL: playwrightBackendUrl,
        ...(playwrightBrowsersPath
          ? { PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath }
          : {}),
        UVICORN_RELOAD: '0',
      },
      reuseExistingServer: false,
      timeout: 180_000,
      url: `http://127.0.0.1:${backendPort}/api/v1/health`,
    },
    {
      command: frontendServerCommand,
      cwd: repoRoot,
      env: {
        ...process.env,
        GPU_BOOKING_AUTH_MODE: 'insecure',
        GPU_BOOKING_BACKEND_PORT: String(backendPort),
        GPU_BOOKING_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
        GPU_BOOKING_FRONTEND_PORT: String(frontendPort),
        GPU_BOOKING_INITIAL_ADMIN_EMAILS: 'admin@example.com',
        AUTH_MODE: 'insecure',
        BACKEND_PORT: String(backendPort),
        BACKEND_URL: `http://127.0.0.1:${backendPort}`,
        FRONTEND_PORT: String(frontendPort),
        INITIAL_ADMIN_EMAILS: 'admin@example.com',
        NEXT_TELEMETRY_DISABLED: '1',
        PLAYWRIGHT_BACKEND_URL: playwrightBackendUrl,
        ...(playwrightBrowsersPath
          ? { PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath }
          : {}),
      },
      reuseExistingServer: false,
      timeout: 180_000,
      url: `http://127.0.0.1:${frontendPort}/api/health`,
    },
  ],
})
