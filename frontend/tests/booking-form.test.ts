/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BookingForm } from '@/components/booking-form'

const mocks = vi.hoisted(() => ({
  createBookingMock: vi.fn(),
  validateBookingMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  routerPushMock: vi.fn(),
}))

const {
  createBookingMock,
  validateBookingMock,
  toastSuccessMock,
  toastErrorMock,
  routerPushMock,
} = mocks

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPushMock,
  }),
}))

vi.mock('@/app/actions', () => ({
  createBooking: mocks.createBookingMock,
  validateBooking: mocks.validateBookingMock,
}))

const gpuTypes = [
  {
    id: 1,
    name: 'H100',
    gram_gb: 80,
    system_memory_gb: 500,
    total_count: 40,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
]

const gramOptions = [{ id: 1, label: '80GB', value_gb: 80, sort_order: 1 }]
const memoryOptions = [{ id: 1, label: '500GB', value_gb: 500, sort_order: 1 }]
const workflowTypes = [{ id: 1, name: 'Training' }]

function renderBookingForm(initialStartDate?: string, initialEndDate?: string) {
  return render(
    createElement(BookingForm, {
      gpuTypes,
      gramOptions,
      memoryOptions,
      workflowTypes,
      initialStartDate,
      initialEndDate,
    })
  )
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('GPU Type'), '1')
  await user.type(screen.getByLabelText('GPU Count'), '4')
  await user.selectOptions(screen.getByLabelText('GRAM'), '1')
  await user.selectOptions(screen.getByLabelText('System Memory'), '1')
  await user.selectOptions(screen.getByLabelText('Workflow Type'), '1')
  await user.type(screen.getByLabelText('Start Date'), '2026-04-10')
  await user.type(screen.getByLabelText('End Date'), '2026-04-12')
}

describe('booking form - F3 acceptance coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()

    createBookingMock.mockResolvedValue({
      status: 'success',
      message: 'Booking created successfully.',
      error: null,
      fieldErrors: {},
    })
    validateBookingMock.mockResolvedValue({
      valid: true,
      warnings: [],
      blocked: false,
      block_reason: null,
    })
  })

  it('creates booking with required fields and redirects with success toast', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(createBookingMock).toHaveBeenCalledTimes(1)
      expect(toastSuccessMock).toHaveBeenCalledWith(
        'Booking created successfully.'
      )
      expect(routerPushMock).toHaveBeenCalledWith('/bookings')
    })
  })

  it('shows client-side errors when required fields are missing', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(screen.getByText('GPU Type is required.')).toBeTruthy()
      expect(screen.getByText('GPU Count is required.')).toBeTruthy()
      expect(screen.getByText('GRAM is required.')).toBeTruthy()
      expect(screen.getByText('System Memory is required.')).toBeTruthy()
      expect(screen.getByText('Workflow Type is required.')).toBeTruthy()
      expect(screen.getByText('Start Date is required.')).toBeTruthy()
      expect(screen.getByText('End Date is required.')).toBeTruthy()
    })
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('shows no-issues message when validate returns no warnings', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('No issues found')).toBeTruthy()
    })
  })

  it('shows warning alerts and keeps submit enabled when validate returns warnings', async () => {
    const user = userEvent.setup()
    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'duration_gt_14_days',
          message: 'Booking duration exceeds 14 days.',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(screen.getByText('Booking duration exceeds 14 days.')).toBeTruthy()
    })
    expect(
      screen
        .getByRole('button', { name: 'Create Booking' })
        .hasAttribute('disabled')
    ).toBe(false)
  })

  it('shows block alert and disables submit when validate returns blocked', async () => {
    const user = userEvent.setup()
    validateBookingMock.mockResolvedValueOnce({
      valid: false,
      warnings: [
        {
          rule: 'capacity_hard_limit',
          message: 'Requested GPUs exceed available capacity.',
          severity: 'block',
        },
      ],
      blocked: true,
      block_reason:
        'Capacity is fully consumed for at least one requested day.',
    })

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(
        screen.getByText('Requested GPUs exceed available capacity.')
      ).toBeTruthy()
      expect(
        screen.getByText(
          'Capacity is fully consumed for at least one requested day.'
        )
      ).toBeTruthy()
    })
    expect(
      screen
        .getByRole('button', { name: 'Create Booking' })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  it('submits all optional fields when provided', async () => {
    const user = userEvent.setup()
    let captured: FormData | null = null

    createBookingMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => {
        captured = formData
        return {
          status: 'success',
          message: 'Booking created successfully.',
          error: null,
          fieldErrors: {},
        }
      }
    )

    renderBookingForm()
    await fillRequiredFields(user)

    await user.type(screen.getByLabelText('Alternate Email'), 'alt@example.com')
    await user.type(screen.getByLabelText('Project Name'), 'Genome Atlas')
    await user.type(screen.getByLabelText('PI/Lead'), 'Dr Test')
    await user.type(screen.getByLabelText('Grant Number'), 'GR-12345')
    await user.type(screen.getByLabelText('Technical Lead'), 'Lead Engineer')
    await user.type(screen.getByLabelText('Event Start Date'), '2026-04-09')
    await user.type(screen.getByLabelText('Event End Date'), '2026-04-13')

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(createBookingMock).toHaveBeenCalledTimes(1)
    })

    expect(captured).toBeTruthy()
    expect(captured?.get('alt_email')).toBe('alt@example.com')
    expect(captured?.get('project_name')).toBe('Genome Atlas')
    expect(captured?.get('project_pi')).toBe('Dr Test')
    expect(captured?.get('project_grant_number')).toBe('GR-12345')
    expect(captured?.get('technical_lead')).toBe('Lead Engineer')
    expect(captured?.get('event_start_date')).toBe('2026-04-09')
    expect(captured?.get('event_end_date')).toBe('2026-04-13')
  })

  it('pre-populates start and end date fields from initial values', () => {
    renderBookingForm('2026-04-01', '2026-04-05')

    const startDate = screen.getByLabelText('Start Date') as HTMLInputElement
    const endDate = screen.getByLabelText('End Date') as HTMLInputElement

    expect(startDate.value).toBe('2026-04-01')
    expect(endDate.value).toBe('2026-04-05')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
