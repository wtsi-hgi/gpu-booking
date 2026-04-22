import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
})

describe('playwright config', () => {
  it('starts the frontend dev server from an isolated scratch workspace', async () => {
    const { default: playwrightConfig } = await import('../playwright.config')

    const frontendServer = playwrightConfig.webServer?.[1]

    expect(frontendServer).toBeDefined()
    expect(frontendServer?.cwd).toBe(path.resolve(__dirname, '..', '..'))

    const isolatedFrontendDir = path.join(
      path.resolve(__dirname, '..', '..'),
      '.tmp',
      'agent',
      'playwright',
      'frontend-app',
    )

    expect(frontendServer?.command).toContain(isolatedFrontendDir)
    expect(frontendServer?.command).not.toContain('cd frontend && pnpm dev')
    expect(frontendServer?.command).toContain('node_modules')
    expect(frontendServer?.command).toContain(
      'pnpm exec next dev --webpack -H 0.0.0.0 -p 3100',
    )
  })
})