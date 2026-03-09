/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCapacityMock: vi.fn(),
  getBookingsMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getGpuTypesMock: vi.fn(),
  routerPushMock: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  getCapacity: mocks.getCapacityMock,
  getBookings: mocks.getBookingsMock,
  getCurrentUser: mocks.getCurrentUserMock,
  getGpuTypes: mocks.getGpuTypesMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPushMock,
  }),
}))

import Home from '@/app/page'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('home route app availability', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
    vi.clearAllMocks()

    mocks.getGpuTypesMock.mockResolvedValue([
      {
        id: 1,
        name: 'H100',
        gram_gb: 80,
        system_memory_gb: 500,
        total_count: 40,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ])
    mocks.getCapacityMock.mockResolvedValue([])
    mocks.getBookingsMock.mockResolvedValue([])
    mocks.getCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'insecure',
    })
  })

  it('renders bookings app on / instead of hello-world placeholder', async () => {
    render(await Home())

    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy()
    expect(
      screen.queryByRole('heading', {
        name: 'Full-stack starter with Server Actions and shadcn/ui',
      })
    ).toBeNull()

    expect(mocks.getGpuTypesMock).toHaveBeenCalledTimes(1)
    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-04-11'
    )
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-04-11'
    )
    expect(mocks.getCurrentUserMock).toHaveBeenCalledTimes(1)
  })
})
