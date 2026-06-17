/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialBookingFormValues } from '@/lib/booking-state'

const mocks = vi.hoisted(() => ({
  getGpuHostTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  getWorkflowTypesMock: vi.fn(),
  createBookingMock: vi.fn(),
  getHostTypeAvailabilityMock: vi.fn(),
  validateBookingMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/app/actions', () => ({
  getGpuHostTypes: mocks.getGpuHostTypesMock,
  getWorkflowTypes: mocks.getWorkflowTypesMock,
  createBooking: mocks.createBookingMock,
  getHostTypeAvailability: mocks.getHostTypeAvailabilityMock,
  validateBooking: mocks.validateBookingMock,
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

import NewBookingPage from '@/app/bookings/new/page'

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()

  mocks.requireCurrentUserMock.mockResolvedValue({
    email: 'dev@example.com',
    is_admin: false,
    auth_mode: 'insecure',
  })
  mocks.getGpuHostTypesMock.mockResolvedValue([
    {
      id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      total_count: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])
  mocks.getWorkflowTypesMock.mockResolvedValue([{ id: 1, name: 'Training' }])

  mocks.createBookingMock.mockResolvedValue({
    status: 'idle',
    message: null,
    error: null,
    fieldErrors: {},
    values: createInitialBookingFormValues(),
  })
  mocks.validateBookingMock.mockResolvedValue({
    valid: true,
    warnings: [],
    blocked: false,
    block_reason: null,
  })
  mocks.getHostTypeAvailabilityMock.mockResolvedValue([
    {
      gpu_host_type_id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      total: 2,
      currently_bookable: 2,
    },
  ])
})

describe('new booking page - F2 query prefill', () => {
  it('renders full booking form with required option-backed controls', async () => {
    render(await NewBookingPage({}))

    expect(screen.getByRole('heading', { name: 'Create Booking' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'New Booking' })).toBeNull()
    expect(
      screen.queryByText('Start a booking request by choosing a date range.')
    ).toBeNull()
    expect(screen.getByLabelText('GPU Host Type')).toBeTruthy()
    expect(screen.getByLabelText('Host Count')).toBeTruthy()
    expect(screen.getByLabelText('Workflow Type')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Booking' })).toBeTruthy()

    expect(mocks.requireCurrentUserMock).toHaveBeenCalledWith('/bookings/new')
    expect(mocks.getGpuHostTypesMock).toHaveBeenCalledTimes(1)
    expect(mocks.getWorkflowTypesMock).toHaveBeenCalledTimes(1)
  })

  it('pre-populates start_date and end_date in the rendered BookingForm from query params', async () => {
    render(
      await NewBookingPage({
        searchParams: Promise.resolve({
          start: '2026-04-01',
          end: '2026-04-05',
        }),
      })
    )

    const startDateInput = screen.getByLabelText(
      'Start Date'
    ) as HTMLInputElement
    const endDateInput = screen.getByLabelText('End Date') as HTMLInputElement

    expect(startDateInput.value).toBe('2026-04-01')
    expect(endDateInput.value).toBe('2026-04-05')
  })
})
