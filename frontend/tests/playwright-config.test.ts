import { describe, expect, it } from 'vitest'

import config from '../playwright.config'

describe('playwright frontend web server config', () => {
  it('uses direct frontend startup without forced webpack or workspace sync copy', () => {
    expect(Array.isArray(config.webServer)).toBe(true)

    const frontendServer = config.webServer?.[1]
    expect(frontendServer).toBeDefined()

    const command = frontendServer?.command ?? ''

    expect(command).toContain('cd frontend')
    expect(command).toContain('pnpm exec next dev')
    expect(command).not.toContain('--webpack')
    expect(command).not.toContain('rsync')
    expect(command).not.toContain('cp -a')
  })
})
