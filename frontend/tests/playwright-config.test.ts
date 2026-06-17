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

  it('runs backend e2e against an isolated scratch SQLite database', () => {
    const backendServer = config.webServer?.[0]
    expect(backendServer).toBeDefined()

    const command = backendServer?.command ?? ''
    expect(command).toContain('gpu-booking-e2e.sqlite3')
    expect(command).not.toContain('backend/gpu_booking.db')

    const databaseUrl = backendServer?.env?.GPU_BOOKING_DATABASE_URL
    expect(databaseUrl).toContain(
      '/.tmp/agent/playwright/gpu-booking-e2e.sqlite3'
    )
    expect(backendServer?.env?.DATABASE_URL).toBe(databaseUrl)
  })
})
