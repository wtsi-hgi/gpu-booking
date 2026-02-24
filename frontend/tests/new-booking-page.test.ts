/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getGpuTypesMock: vi.fn(),
  getGramOptionsMock: vi.fn(),
  getMemoryOptionsMock: vi.fn(),
  getWorkflowTypesMock: vi.fn(),
  createBookingMock: vi.fn(),
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
  getCurrentUser: mocks.getCurrentUserMock,
  getGpuTypes: mocks.getGpuTypesMock,
  getGramOptions: mocks.getGramOptionsMock,
  getMemoryOptions: mocks.getMemoryOptionsMock,
  getWorkflowTypes: mocks.getWorkflowTypesMock,
  createBooking: mocks.createBookingMock,
  validateBooking: mocks.validateBookingMock,
}))

import NewBookingPage from '@/app/bookings/new/page'

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()

  mocks.getCurrentUserMock.mockResolvedValue({
    email: 'dev@example.com',
    is_admin: false,
    auth_mode: 'insecure',
  })
  mocks.getGpuTypesMock.mockResolvedValue([
    {
      id: 1,
      name: 'H100',
      gram_gb: 80,
      system_memory_gb: 500,
      total_count: 16,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])
  mocks.getGramOptionsMock.mockResolvedValue([
    { id: 1, label: '80GB', value_gb: 80, sort_order: 1 },
  ])
  mocks.getMemoryOptionsMock.mockResolvedValue([
    { id: 1, label: '500GB', value_gb: 500, sort_order: 1 },
  ])
  mocks.getWorkflowTypesMock.mockResolvedValue([{ id: 1, name: 'Training' }])

  mocks.createBookingMock.mockResolvedValue({
    status: 'idle',
    message: null,
    error: null,
    fieldErrors: {},
  })
  mocks.validateBookingMock.mockResolvedValue({
    valid: true,
    warnings: [],
    blocked: false,
    block_reason: null,
  })
})

describe('new booking page - F2 query prefill', () => {
  it('renders full booking form with required option-backed controls', async () => {
    render(await NewBookingPage({}))

    expect(screen.getByRole('heading', { name: 'Create Booking' })).toBeTruthy()
    expect(screen.getByLabelText('GPU Type')).toBeTruthy()
    expect(screen.getByLabelText('GRAM')).toBeTruthy()
    expect(screen.getByLabelText('System Memory')).toBeTruthy()
    expect(screen.getByLabelText('Workflow Type')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Booking' })).toBeTruthy()

    expect(mocks.getCurrentUserMock).toHaveBeenCalledTimes(1)
    expect(mocks.getGpuTypesMock).toHaveBeenCalledTimes(1)
    expect(mocks.getWorkflowTypesMock).toHaveBeenCalledTimes(1)
    expect(mocks.getGramOptionsMock).toHaveBeenCalledWith('dev@example.com')
    expect(mocks.getMemoryOptionsMock).toHaveBeenCalledWith('dev@example.com')
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
