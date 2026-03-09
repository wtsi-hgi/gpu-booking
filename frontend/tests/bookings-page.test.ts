/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

type BookingStatus =
  | 'unconfirmed'
  | 'confirmed'
  | 'tentative'
  | 'spot'
  | 'rejected'
  | 'cancelled'

function buildCapacity(
  date: string,
  total: number,
  confirmedUsed: number,
  pendingUsed: number,
  gpuTypeId = 1,
  gpuTypeName = 'H100'
) {
  return {
    date,
    gpu_type_id: gpuTypeId,
    gpu_type_name: gpuTypeName,
    total,
    confirmed_used: confirmedUsed,
    pending_used: pendingUsed,
    available: Math.max(total - confirmedUsed - pendingUsed, 0),
    user_used: confirmedUsed + pendingUsed,
    user_percent: total > 0 ? ((confirmedUsed + pendingUsed) / total) * 100 : 0,
    warnings: [],
  }
}

function buildBooking(id: number, status: BookingStatus = 'confirmed') {
  return {
    id,
    user_email: 'user@example.com',
    gpu_type_id: 1,
    gpu_type_name: 'H100',
    gpu_count: 2,
    gram_option_id: 1,
    gram_label: '80GB',
    memory_option_id: 1,
    memory_label: '500GB',
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-03-10',
    end_date: '2026-03-12',
    status,
    alt_email: null,
    project_name: null,
    project_pi: null,
    project_grant_number: null,
    technical_lead: null,
    event_start_date: null,
    event_end_date: null,
    admin_notes: null,
    admin_modified_by: null,
    admin_modified_at: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    warnings: [],
  }
}

describe('bookings page - F1 calendar grid', () => {
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
      {
        id: 2,
        name: 'A100',
        gram_gb: 40,
        system_memory_gb: 256,
        total_count: 20,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ])

    mocks.getCapacityMock.mockImplementation(
      async (_startDate: string, _endDate: string, gpuTypeId?: number) => {
        if (gpuTypeId === 1) {
          return [buildCapacity('2026-03-10', 40, 20, 0, 1, 'H100')]
        }

        return [buildCapacity('2026-03-10', 80, 20, 0)]
      }
    )
    mocks.getBookingsMock.mockResolvedValue([buildBooking(1)])
    mocks.getCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'insecure',
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('displays March monthly calendar grid with capacity bars on booked days', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy()
    expect(screen.getByText('March 2026')).toBeTruthy()
    expect(document.querySelector('[data-calendar-grid="true"]')).toBeTruthy()

    const bookedDayCell = document.querySelector('[data-date="2026-03-10"]')
    expect(bookedDayCell).toBeTruthy()
    expect(
      bookedDayCell?.querySelector('[data-capacity-total="80"]')
    ).toBeTruthy()
  })

  it('shows 50% solid confirmed usage for 20 of 40 confirmed GPUs', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 20, 0, 1, 'H100'),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const confirmedSegment = dayCell?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null

    expect(confirmedSegment).toBeTruthy()
    expect(confirmedSegment?.style.width).toBe('50%')
  })

  it('shows stacked solid and hatched capacity portions for confirmed and pending usage', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 15, 5, 1, 'H100'),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const confirmedSegment = dayCell?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    const pendingSegment = dayCell?.querySelector(
      '[data-capacity-segment="pending"]'
    ) as HTMLElement | null

    expect(confirmedSegment?.style.width).toBe('37.5%')
    expect(pendingSegment?.style.width).toBe('12.5%')
  })

  it('navigates to previous month and reloads capacity data', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    fireEvent.click(screen.getByRole('button', { name: 'Previous Month' }))
    await vi.runAllTimersAsync()

    expect(screen.getByText('February 2026')).toBeTruthy()

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-02-01',
      '2026-02-28',
      undefined
    )
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-02-01',
      '2026-02-28',
      undefined
    )
  })

  it('updates capacity display when GPU type filter changes to H100', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCellBefore = document.querySelector('[data-date="2026-03-10"]')
    const confirmedBefore = dayCellBefore?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    expect(confirmedBefore?.style.width).toBe('25%')

    fireEvent.change(screen.getByLabelText('GPU Type'), {
      target: { value: '1' },
    })
    await vi.runAllTimersAsync()

    const dayCellAfter = document.querySelector('[data-date="2026-03-10"]')
    const confirmedAfter = dayCellAfter?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    expect(confirmedAfter?.style.width).toBe('50%')

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-03-31',
      1
    )
  })

  it('renders empty 0% capacity bars for all current-month day cells with no bookings', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([])
    mocks.getBookingsMock.mockResolvedValueOnce([])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const currentMonthCells = Array.from(
      document.querySelectorAll('[data-current-month="true"]')
    )

    expect(currentMonthCells.length).toBe(31)
    expect(
      currentMonthCells.every((cell) =>
        Boolean(cell.querySelector('[data-capacity-total="0"]'))
      )
    ).toBe(true)
  })

  it('opens booking form with single-day range when a day is double-clicked', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-15"]')
    expect(dayCell).toBeTruthy()

    fireEvent.doubleClick(dayCell as Element)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-03-15&end=2026-03-15'
    )
  })

  it('shows the dragged date range while selecting multiple days', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const middleDayCell = document.querySelector('[data-date="2026-03-12"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')
    const outsideDayCell = document.querySelector('[data-date="2026-03-15"]')

    expect(startDayCell).toBeTruthy()
    expect(middleDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()
    expect(outsideDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)

    expect(startDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(middleDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(endDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(outsideDayCell?.getAttribute('data-drag-selected')).toBe('false')
    expect(mocks.routerPushMock).not.toHaveBeenCalled()
  })

  it('opens booking form with dragged date range when user drags across days', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')

    expect(startDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseUp(endDayCell as Element)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-03-10&end=2026-03-14'
    )
  })

  it('opens booking form without prefilled dates when New Booking is clicked', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    fireEvent.click(screen.getByRole('button', { name: 'New Booking' }))

    expect(mocks.routerPushMock).toHaveBeenCalledWith('/bookings/new')
  })
})
