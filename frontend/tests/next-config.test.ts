import { afterEach, describe, expect, it, vi } from 'vitest'

const originalGpuBookingNextDistDir = process.env.GPU_BOOKING_NEXT_DIST_DIR
const originalNextDistDir = process.env.NEXT_DIST_DIR

afterEach(() => {
  if (originalGpuBookingNextDistDir === undefined) {
    delete process.env.GPU_BOOKING_NEXT_DIST_DIR
  } else {
    process.env.GPU_BOOKING_NEXT_DIST_DIR = originalGpuBookingNextDistDir
  }

  if (originalNextDistDir === undefined) {
    delete process.env.NEXT_DIST_DIR
  } else {
    process.env.NEXT_DIST_DIR = originalNextDistDir
  }

  vi.resetModules()
})

describe('next config', () => {
  it('does not allow env vars to move the dist directory outside the frontend app', async () => {
    process.env.GPU_BOOKING_NEXT_DIST_DIR = '/tmp/agent/playwright/next-dev'
    process.env.NEXT_DIST_DIR = '/tmp/agent/playwright/next-dev'

    vi.resetModules()

    const { default: nextConfig } = await import('../next.config')

    expect(nextConfig).not.toHaveProperty('distDir')
  })
})
