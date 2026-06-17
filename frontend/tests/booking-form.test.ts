/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BookingForm } from '@/components/booking-form'
import type { GpuHostType, WorkflowType } from '@/lib/admin-contracts'
import type {
  BookingValidation,
  HostTypeAvailability,
} from '@/lib/booking-contracts'
import {
  createInitialBookingFormValues,
  type BookingFormState,
} from '@/lib/booking-state'

const mocks = vi.hoisted(() => ({
  createBookingMock: vi.fn(),
  validateBookingMock: vi.fn(),
  getHostTypeAvailabilityMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  routerPushMock: vi.fn(),
  scrollToMock: vi.fn(),
}))

const {
  createBookingMock,
  validateBookingMock,
  getHostTypeAvailabilityMock,
  toastSuccessMock,
  toastErrorMock,
  routerPushMock,
  scrollToMock,
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
  getHostTypeAvailability: mocks.getHostTypeAvailabilityMock,
  validateBooking: mocks.validateBookingMock,
}))

const gpuHostTypes: GpuHostType[] = [
  {
    id: 1,
    gpu_type: 'H100',
    gpu_count: 8,
    total_count: 5,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
]

const workflowTypes: WorkflowType[] = [{ id: 1, name: 'Training' }]

function createAvailability(
  hostTypes: GpuHostType[] = gpuHostTypes
): HostTypeAvailability[] {
  return hostTypes.map((hostType) => ({
    gpu_host_type_id: hostType.id,
    gpu_type: hostType.gpu_type,
    gpu_count: hostType.gpu_count,
    total: hostType.total_count,
    currently_bookable: hostType.total_count,
  }))
}

function renderBookingForm(
  initialStartDate?: string,
  initialEndDate?: string,
  nextGpuHostTypes: GpuHostType[] = gpuHostTypes
) {
  return render(
    createElement(BookingForm, {
      gpuHostTypes: nextGpuHostTypes,
      workflowTypes,
      initialStartDate,
      initialEndDate,
    })
  )
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  const startDate = getRelativeDate(2)
  const endDate = getRelativeDate(4)

  await fillRequiredFieldsWithDates(user, startDate, endDate)

  return { startDate, endDate }
}

async function fillRequiredFieldsWithDates(
  user: ReturnType<typeof userEvent.setup>,
  startDate: string,
  endDate: string
) {
  await user.selectOptions(screen.getByLabelText('GPU Host Type'), '1')
  await user.type(screen.getByLabelText('Host Count'), '4')
  await user.selectOptions(screen.getByLabelText('Workflow Type'), '1')
  await user.type(screen.getByLabelText('Start Date'), startDate)
  await user.type(screen.getByLabelText('End Date'), endDate)
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getRelativeDate(daysFromToday: number) {
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + daysFromToday)

  return formatDateInputValue(nextDate)
}

function getSubmittedBookingFormValues(formData: FormData) {
  return createInitialBookingFormValues({
    gpu_host_type_id: (formData.get('gpu_host_type_id') ?? '').toString(),
    host_count: (formData.get('host_count') ?? '').toString(),
    workflow_type_id: (formData.get('workflow_type_id') ?? '').toString(),
    alt_email: (formData.get('alt_email') ?? '').toString(),
    start_date: (formData.get('start_date') ?? '').toString(),
    end_date: (formData.get('end_date') ?? '').toString(),
    project_name: (formData.get('project_name') ?? '').toString(),
    project_pi: (formData.get('project_pi') ?? '').toString(),
    project_grant_number: (
      formData.get('project_grant_number') ?? ''
    ).toString(),
    technical_lead: (formData.get('technical_lead') ?? '').toString(),
    event_start_date: (formData.get('event_start_date') ?? '').toString(),
    event_end_date: (formData.get('event_end_date') ?? '').toString(),
  })
}

function getFieldContainer(label: string) {
  const field = screen.getByLabelText(label)

  if (!(field.parentElement instanceof HTMLElement)) {
    throw new Error(`Missing field container for ${label}`)
  }

  return field.parentElement
}

function createDomRect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    width: 320,
    height,
    top,
    right: 320,
    bottom: top + height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

describe('booking form - F3 acceptance coverage', () => {
  beforeEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.clearAllMocks()

    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      writable: true,
      value: 0,
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 0,
    })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollToMock,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    })

    createBookingMock.mockResolvedValue({
      status: 'success',
      message: 'Booking created successfully.',
      error: null,
      fieldErrors: {},
      values: createInitialBookingFormValues(),
    })
    validateBookingMock.mockResolvedValue({
      valid: true,
      warnings: [],
      blocked: false,
      block_reason: null,
    })
    getHostTypeAvailabilityMock.mockResolvedValue(createAvailability())
  })

  it('does not render a separate Validate button', () => {
    renderBookingForm()

    expect(screen.queryByRole('button', { name: 'Validate' })).toBeNull()
  })

  it('omits the automatic capacity check helper text', () => {
    renderBookingForm()

    expect(
      screen.queryByText(
        /Capacity checks run automatically before submission\./
      )
    ).toBeNull()
  })

  it('omits GPU host types with zero configured hosts from the selector', () => {
    renderBookingForm(undefined, undefined, [
      ...gpuHostTypes,
      {
        id: 2,
        gpu_type: 'A100',
        gpu_count: 8,
        total_count: 0,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ])

    const gpuHostTypeSelect = screen.getByLabelText('GPU Host Type')

    expect(
      within(gpuHostTypeSelect).getByRole('option', {
        name: 'Select GPU host type',
      })
    ).toBeTruthy()
    expect(
      within(gpuHostTypeSelect).getByRole('option', { name: '8 GPU H100' })
    ).toBeTruthy()
    expect(
      within(gpuHostTypeSelect).queryByRole('option', { name: '8 GPU A100' })
    ).toBeNull()
  })

  it('disables Host Count until a GPU host type is selected', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement

    expect(hostCountInput.disabled).toBe(true)

    await user.selectOptions(screen.getByLabelText('GPU Host Type'), '1')

    expect(hostCountInput.disabled).toBe(false)
  })

  it('disables host types that have zero currently bookable hosts for the selected range', async () => {
    const user = userEvent.setup()
    const h200 = {
      id: 2,
      gpu_type: 'H200',
      gpu_count: 8,
      total_count: 3,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }
    const h100 = {
      id: 3,
      gpu_type: 'H100',
      gpu_count: 8,
      total_count: 2,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }
    getHostTypeAvailabilityMock.mockResolvedValueOnce([
      {
        gpu_host_type_id: h200.id,
        gpu_type: 'H200',
        gpu_count: 8,
        total: 3,
        currently_bookable: 1,
      },
      {
        gpu_host_type_id: h100.id,
        gpu_type: 'H100',
        gpu_count: 8,
        total: 2,
        currently_bookable: 0,
      },
    ])

    renderBookingForm('2026-07-22', '2026-07-23', [h200, h100])

    await waitFor(() => {
      expect(getHostTypeAvailabilityMock).toHaveBeenCalledWith(
        '2026-07-22',
        '2026-07-23'
      )
    })

    const gpuHostTypeSelect = screen.getByLabelText(
      'GPU Host Type'
    ) as HTMLSelectElement
    const h100Option = within(gpuHostTypeSelect).getByRole('option', {
      name: '8 GPU H100 (none available)',
    }) as HTMLOptionElement

    expect(h100Option.disabled).toBe(true)

    await user.selectOptions(gpuHostTypeSelect, String(h100.id))

    expect(gpuHostTypeSelect.value).toBe('')
  })

  it('limits Host Count to the selected host type currently bookable maximum', async () => {
    const user = userEvent.setup()
    getHostTypeAvailabilityMock.mockResolvedValueOnce([
      {
        gpu_host_type_id: 1,
        gpu_type: 'H100',
        gpu_count: 8,
        total: 5,
        currently_bookable: 1,
      },
    ])
    renderBookingForm('2026-07-22', '2026-07-23')

    await waitFor(() => {
      expect(getHostTypeAvailabilityMock).toHaveBeenCalledWith(
        '2026-07-22',
        '2026-07-23'
      )
    })
    await user.selectOptions(screen.getByLabelText('GPU Host Type'), '1')

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement

    expect(hostCountInput.max).toBe('1')

    fireEvent.change(hostCountInput, { target: { value: '2' } })

    expect(hostCountInput.value).toBe('1')
  })

  it('coerces Host Count down when the selected date range reduces availability', async () => {
    const user = userEvent.setup()
    getHostTypeAvailabilityMock
      .mockResolvedValueOnce([
        {
          gpu_host_type_id: 1,
          gpu_type: 'H100',
          gpu_count: 8,
          total: 5,
          currently_bookable: 5,
        },
      ])
      .mockResolvedValueOnce([
        {
          gpu_host_type_id: 1,
          gpu_type: 'H100',
          gpu_count: 8,
          total: 5,
          currently_bookable: 1,
        },
      ])

    renderBookingForm('2026-07-22', '2026-07-22')

    await waitFor(() => {
      expect(getHostTypeAvailabilityMock).toHaveBeenCalledWith(
        '2026-07-22',
        '2026-07-22'
      )
    })
    await user.selectOptions(screen.getByLabelText('GPU Host Type'), '1')
    await user.type(screen.getByLabelText('Host Count'), '4')

    expect(
      (screen.getByLabelText('Host Count') as HTMLInputElement).value
    ).toBe('4')

    await user.clear(screen.getByLabelText('End Date'))
    await user.type(screen.getByLabelText('End Date'), '2026-07-23')

    await waitFor(() => {
      expect(getHostTypeAvailabilityMock).toHaveBeenCalledWith(
        '2026-07-22',
        '2026-07-23'
      )
      expect(
        (screen.getByLabelText('Host Count') as HTMLInputElement).value
      ).toBe('1')
    })
  })

  it('provides a close icon action that returns to the bookings page without submitting', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderBookingForm()

    await user.click(screen.getByRole('button', { name: 'Close form' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/bookings')
    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('asks for confirmation before closing when form details have changed', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    renderBookingForm()

    await user.type(screen.getByLabelText('Project Name'), 'Atlas')
    await user.click(screen.getByRole('button', { name: 'Close form' }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'Discard changes to this booking request?'
    )
    expect(routerPushMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close form' }))

    expect(routerPushMock).toHaveBeenCalledWith('/bookings')
    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('defaults event dates to the booking range for a new booking flow', () => {
    renderBookingForm('2026-05-12', '2026-05-16')

    expect(
      (screen.getByLabelText('Start Date') as HTMLInputElement).value
    ).toBe('2026-05-12')
    expect((screen.getByLabelText('End Date') as HTMLInputElement).value).toBe(
      '2026-05-16'
    )
    expect(
      (screen.getByLabelText('Event Start Date') as HTMLInputElement).value
    ).toBe('2026-05-12')
    expect(
      (screen.getByLabelText('Event End Date') as HTMLInputElement).value
    ).toBe('2026-05-16')
  })

  it('auto-validates and submits immediately when validation passes cleanly', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(1)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
      expect(toastSuccessMock).toHaveBeenCalledWith(
        'Booking created successfully.'
      )
      expect(routerPushMock).toHaveBeenCalledWith('/bookings')
    })

    expect(validateBookingMock.mock.invocationCallOrder[0]).toBeLessThan(
      createBookingMock.mock.invocationCallOrder[0]
    )
  })

  it('shows client-side errors when required fields are missing', async () => {
    const user = userEvent.setup()
    renderBookingForm()

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(screen.getByText('GPU Host Type is required.')).toBeTruthy()
      expect(screen.getByText('Host Count is required.')).toBeTruthy()
      expect(screen.getByText('Workflow Type is required.')).toBeTruthy()
      expect(screen.getByText('Start Date is required.')).toBeTruthy()
      expect(screen.getByText('End Date is required.')).toBeTruthy()
    })
    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('shows blocking capacity feedback under Host Count and stops submission', async () => {
    const user = userEvent.setup()
    validateBookingMock.mockResolvedValueOnce({
      valid: false,
      warnings: [],
      blocked: true,
      block_reason: '100% capacity exceeded for 2026-04-10',
    })

    renderBookingForm()
    const { startDate, endDate } = await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const feedback = within(hostCountContainer).getByText(
        '100% capacity exceeded for 2026-04-10'
      )

      expect(feedback.className).toContain('text-destructive')
    })

    expect(validateBookingMock).toHaveBeenCalledTimes(1)
    expect(createBookingMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create Booking' })).toBeTruthy()
  })

  it('shows the per-user capacity warning under Host Count, shows the warning area, and changes the button to Confirm', async () => {
    const user = userEvent.setup()
    const warningMessage =
      'Proposed booking exceeds 40% per-user capacity on 2026-04-10'

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message: warningMessage,
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    const { startDate, endDate } = await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const inlineWarning = within(hostCountContainer).getByText(warningMessage)
      const inlineWarningFeedback = inlineWarning.closest(
        '[data-validation-severity="warning"]'
      )

      expect(inlineWarningFeedback).toBeTruthy()
      expect(inlineWarningFeedback?.className).not.toContain('text-destructive')

      const warningArea = screen.getByText(
        'Review warnings before confirming.'
      ).parentElement

      expect(warningArea).toBeTruthy()
      expect(warningArea?.className).not.toContain('text-destructive')
      expect(
        within(warningArea as HTMLElement).getByText(warningMessage)
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    })

    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('shows advance notice warnings under Start Date and not under Host Count', async () => {
    const user = userEvent.setup()
    const warningMessage = 'Less than 2 weeks advance notice'

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'advance_notice_min_14_days',
          message: warningMessage,
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const startDateContainer = getFieldContainer('Start Date')
    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const inlineWarning = within(startDateContainer).getByText(warningMessage)
      const inlineWarningFeedback = inlineWarning.closest(
        '[data-validation-severity="warning"]'
      )

      expect(inlineWarningFeedback).toBeTruthy()
      expect(inlineWarningFeedback?.className).not.toContain('text-destructive')
      expect(within(hostCountContainer).queryByText(warningMessage)).toBeNull()

      const warningArea = screen.getByText(
        'Review warnings before confirming.'
      ).parentElement

      expect(warningArea).toBeTruthy()
      expect(warningArea?.className).not.toContain('text-destructive')
      expect(
        within(warningArea as HTMLElement).getByText(warningMessage)
      ).toBeTruthy()
      expect(screen.getAllByText(warningMessage)).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    })

    expect(createBookingMock).not.toHaveBeenCalled()
  }, 10_000)

  it('shows duration warnings under End Date and not under Host Count', async () => {
    const user = userEvent.setup()
    const warningMessage = 'Booking duration exceeds 14-day maximum'

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'duration_max_14_days',
          message: warningMessage,
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const endDateContainer = getFieldContainer('End Date')
    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const inlineWarning = within(endDateContainer).getByText(warningMessage)
      const inlineWarningFeedback = inlineWarning.closest(
        '[data-validation-severity="warning"]'
      )

      expect(inlineWarningFeedback).toBeTruthy()
      expect(inlineWarningFeedback?.className).not.toContain('text-destructive')
      expect(within(hostCountContainer).queryByText(warningMessage)).toBeNull()
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    })

    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('shows end-date-before-start-date inline under End Date and skips submission', async () => {
    const user = userEvent.setup()

    renderBookingForm()
    await fillRequiredFieldsWithDates(
      user,
      getRelativeDate(5),
      getRelativeDate(3)
    )

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const endDateContainer = getFieldContainer('End Date')
    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const feedback = within(endDateContainer).getByText(
        'Start date must be before end date'
      )

      expect(feedback.className).toContain('text-destructive')
      expect(
        within(hostCountContainer).queryByText(feedback.textContent ?? '')
      ).toBeNull()
    })

    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('shows start-date-in-the-future feedback inline under Start Date and skips submission', async () => {
    const user = userEvent.setup()
    const startDate = getRelativeDate(0)
    const endDate = getRelativeDate(1)

    renderBookingForm()
    await fillRequiredFieldsWithDates(user, startDate, endDate)

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const startDateContainer = getFieldContainer('Start Date')
    const hostCountContainer = getFieldContainer('Host Count')

    await waitFor(() => {
      const feedback = within(startDateContainer).getByText(
        'Start date must be in the future'
      )

      expect(feedback.className).toContain('text-destructive')
      expect(
        within(hostCountContainer).queryByText(feedback.textContent ?? '')
      ).toBeNull()
    })

    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('clears start-date-in-the-future feedback when the form changes', async () => {
    const user = userEvent.setup()
    const startDate = getRelativeDate(0)
    const endDate = getRelativeDate(1)

    renderBookingForm()
    await fillRequiredFieldsWithDates(user, startDate, endDate)

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(screen.getByText('Start date must be in the future')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: getRelativeDate(2) },
    })

    await waitFor(() => {
      expect(screen.queryByText('Start date must be in the future')).toBeNull()
    })

    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('clears end-date-before-start-date feedback when the form changes', async () => {
    const user = userEvent.setup()

    renderBookingForm()
    await fillRequiredFieldsWithDates(
      user,
      getRelativeDate(5),
      getRelativeDate(3)
    )

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(
        screen.getByText('Start date must be before end date')
      ).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-04-13' },
    })

    await waitFor(() => {
      expect(
        screen.queryByText('Start date must be before end date')
      ).toBeNull()
    })

    expect(validateBookingMock).not.toHaveBeenCalled()
    expect(createBookingMock).not.toHaveBeenCalled()
  })

  it('scrolls down to reveal the warning summary when Confirm is shown', async () => {
    const user = userEvent.setup()

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 640,
    })

    const getBoundingClientRectMock = vi
      .spyOn(window.HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.textContent?.includes('Review warnings before confirming.')) {
          return createDomRect(760, 140)
        }

        return createDomRect(0, 0)
      })

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message:
            'Proposed booking exceeds 40% per-user capacity on 2026-04-10',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    try {
      renderBookingForm()
      await fillRequiredFields(user)

      await user.click(screen.getByRole('button', { name: 'Create Booking' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
        expect(scrollToMock).toHaveBeenCalledTimes(1)
      })

      const scrollOptions = scrollToMock.mock.calls[0]?.[0] as {
        left: number
        top: number
      }

      expect(scrollOptions.left).toBe(0)
      expect(scrollOptions.top).toBeGreaterThan(640)
    } finally {
      getBoundingClientRectMock.mockRestore()
    }
  })

  it('does not force an upward scroll when Confirm is shown and the warning summary is already visible', async () => {
    const user = userEvent.setup()

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 640,
    })

    const getBoundingClientRectMock = vi
      .spyOn(window.HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.textContent?.includes('Review warnings before confirming.')) {
          return createDomRect(24, 160)
        }

        return createDomRect(0, 0)
      })

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message:
            'Proposed booking exceeds 40% per-user capacity on 2026-04-10',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    try {
      renderBookingForm()
      await fillRequiredFields(user)

      await user.click(screen.getByRole('button', { name: 'Create Booking' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
      })

      expect(scrollToMock).not.toHaveBeenCalled()
    } finally {
      getBoundingClientRectMock.mockRestore()
    }
  })

  it('submits when Confirm is clicked after warnings are shown', async () => {
    const user = userEvent.setup()

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message:
            'Proposed booking exceeds 40% per-user capacity on 2026-04-10',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    await fillRequiredFields(user)

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(1)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
      expect(toastSuccessMock).toHaveBeenCalledWith(
        'Booking created successfully.'
      )
    })
  })

  it('clears warning confirmation state when the form changes and revalidates on the next submit', async () => {
    const user = userEvent.setup()
    const warningMessage =
      'Proposed booking exceeds 40% per-user capacity on 2026-04-10'

    validateBookingMock.mockResolvedValueOnce({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message: warningMessage,
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
      expect(screen.getAllByText(warningMessage)).toHaveLength(2)
    })

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement
    await user.clear(hostCountInput)
    await user.type(hostCountInput, '3')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Create Booking' })
      ).toBeTruthy()
      expect(
        screen.queryByText('Review warnings before confirming.')
      ).toBeNull()
      expect(screen.queryByText(warningMessage)).toBeNull()
    })

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(2)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores stale warning responses after the form changes during validation', async () => {
    const user = userEvent.setup()
    const warningMessage =
      'Proposed booking exceeds 40% per-user capacity on 2026-04-10'
    const firstValidation = createDeferred<BookingValidation>()

    validateBookingMock.mockImplementationOnce(() => firstValidation.promise)

    renderBookingForm()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement
    await user.clear(hostCountInput)
    await user.type(hostCountInput, '5')

    firstValidation.resolve({
      valid: true,
      warnings: [
        {
          rule: 'user_capacity_40_percent',
          message: warningMessage,
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
      expect(
        screen.queryByText('Review warnings before confirming.')
      ).toBeNull()
      expect(screen.queryByText(warningMessage)).toBeNull()
      expect(createBookingMock).not.toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(2)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
    })

    expect(
      (validateBookingMock.mock.calls[0][0] as FormData).get('host_count')
    ).toBe('4')
    expect(
      (validateBookingMock.mock.calls[1][0] as FormData).get('host_count')
    ).toBe('5')
    expect(
      getSubmittedBookingFormValues(
        createBookingMock.mock.calls[0][1] as FormData
      ).host_count
    ).toBe('5')
  })

  it('ignores stale clean validation responses so create-booking uses the latest values', async () => {
    const user = userEvent.setup()
    const firstValidation = createDeferred<BookingValidation>()

    validateBookingMock.mockImplementationOnce(() => firstValidation.promise)

    renderBookingForm()
    const { startDate, endDate } = await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement
    await user.clear(hostCountInput)
    await user.type(hostCountInput, '5')

    firstValidation.resolve({
      valid: true,
      warnings: [],
      blocked: false,
      block_reason: null,
    })

    await waitFor(() => {
      expect(createBookingMock).not.toHaveBeenCalled()
      expect(
        screen.getByRole('button', { name: 'Create Booking' })
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(2)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
    })

    expect(
      (validateBookingMock.mock.calls[0][0] as FormData).get('host_count')
    ).toBe('4')
    expect(
      (validateBookingMock.mock.calls[1][0] as FormData).get('host_count')
    ).toBe('5')
    expect(
      getSubmittedBookingFormValues(
        createBookingMock.mock.calls[0][1] as FormData
      ).host_count
    ).toBe('5')
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
          values: getSubmittedBookingFormValues(formData),
        }
      }
    )

    renderBookingForm()
    const { startDate, endDate } = await fillRequiredFields(user)

    await user.type(screen.getByLabelText('Alternate Email'), 'alt@example.com')
    await user.type(screen.getByLabelText('Project Name'), 'Genome Atlas')
    await user.type(screen.getByLabelText('PI/Lead'), 'Dr Test')
    await user.type(screen.getByLabelText('Grant Number'), 'GR-12345')
    await user.type(screen.getByLabelText('Technical Lead'), 'Lead Engineer')
    await user.type(screen.getByLabelText('Event Start Date'), '2026-04-09')
    await user.type(screen.getByLabelText('Event End Date'), '2026-04-13')

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(1)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
    })

    if (captured === null) {
      throw new Error('Expected submitted form data to be captured')
    }

    const submittedFormData = captured as FormData

    expect(submittedFormData.get('alt_email')).toBe('alt@example.com')
    expect(submittedFormData.get('project_name')).toBe('Genome Atlas')
    expect(submittedFormData.get('project_pi')).toBe('Dr Test')
    expect(submittedFormData.get('project_grant_number')).toBe('GR-12345')
    expect(submittedFormData.get('technical_lead')).toBe('Lead Engineer')
    expect(submittedFormData.get('event_start_date')).toBe('2026-04-09')
    expect(submittedFormData.get('event_end_date')).toBe('2026-04-13')
    expect(submittedFormData.get('start_date')).toBe(startDate)
    expect(submittedFormData.get('end_date')).toBe(endDate)
  })

  it('preserves entered values after a create-booking error so the form can be corrected and resubmitted', async () => {
    const user = userEvent.setup()

    createBookingMock.mockImplementationOnce(
      async (_prev: unknown, formData: FormData) => ({
        status: 'error',
        message: null,
        error: '100% capacity exceeded for 2026-04-10',
        fieldErrors: {},
        values: getSubmittedBookingFormValues(formData),
      })
    )

    renderBookingForm()
    const { startDate, endDate } = await fillRequiredFields(user)

    await user.type(screen.getByLabelText('Alternate Email'), 'alt@example.com')
    await user.type(screen.getByLabelText('Project Name'), 'Genome Atlas')
    await user.type(screen.getByLabelText('PI/Lead'), 'Dr Test')
    await user.type(screen.getByLabelText('Grant Number'), 'GR-12345')
    await user.type(screen.getByLabelText('Technical Lead'), 'Lead Engineer')
    await user.type(screen.getByLabelText('Event Start Date'), '2026-04-09')
    await user.type(screen.getByLabelText('Event End Date'), '2026-04-13')

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    await waitFor(() => {
      expect(validateBookingMock).toHaveBeenCalledTimes(1)
      expect(createBookingMock).toHaveBeenCalledTimes(1)
      expect(toastErrorMock).toHaveBeenCalledWith(
        '100% capacity exceeded for 2026-04-10'
      )
    })

    expect(
      (screen.getByLabelText('GPU Host Type') as HTMLSelectElement).value
    ).toBe('1')
    expect(
      (screen.getByLabelText('Host Count') as HTMLInputElement).value
    ).toBe('4')
    expect(
      (screen.getByLabelText('Workflow Type') as HTMLSelectElement).value
    ).toBe('1')
    expect(
      (screen.getByLabelText('Start Date') as HTMLInputElement).value
    ).toBe(startDate)
    expect((screen.getByLabelText('End Date') as HTMLInputElement).value).toBe(
      endDate
    )
    expect(
      (screen.getByLabelText('Alternate Email') as HTMLInputElement).value
    ).toBe('alt@example.com')
    expect(
      (screen.getByLabelText('Project Name') as HTMLInputElement).value
    ).toBe('Genome Atlas')
    expect((screen.getByLabelText('PI/Lead') as HTMLInputElement).value).toBe(
      'Dr Test'
    )
    expect(
      (screen.getByLabelText('Grant Number') as HTMLInputElement).value
    ).toBe('GR-12345')
    expect(
      (screen.getByLabelText('Technical Lead') as HTMLInputElement).value
    ).toBe('Lead Engineer')
    expect(
      (screen.getByLabelText('Event Start Date') as HTMLInputElement).value
    ).toBe('2026-04-09')
    expect(
      (screen.getByLabelText('Event End Date') as HTMLInputElement).value
    ).toBe('2026-04-13')

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement
    await user.clear(hostCountInput)
    await user.type(hostCountInput, '3')
    expect(hostCountInput.value).toBe('3')

    const projectNameInput = screen.getByLabelText(
      'Project Name'
    ) as HTMLInputElement
    await user.clear(projectNameInput)
    await user.type(projectNameInput, 'Genome Atlas Revised')
    expect(projectNameInput.value).toBe('Genome Atlas Revised')

    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('disables editing while create-booking is pending so error rehydration cannot overwrite newer input', async () => {
    const user = userEvent.setup()
    const createBookingRequest = createDeferred<BookingFormState>()

    createBookingMock.mockImplementationOnce(
      async (_prev: unknown, formData: FormData) => {
        const submittedValues = getSubmittedBookingFormValues(formData)

        return createBookingRequest.promise.then(() => ({
          status: 'error',
          message: null,
          error: '100% capacity exceeded for 2026-04-10',
          fieldErrors: {},
          values: submittedValues,
        }))
      }
    )

    renderBookingForm()
    await fillRequiredFields(user)
    await user.type(screen.getByLabelText('Project Name'), 'Genome Atlas')

    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    const hostCountInput = screen.getByLabelText(
      'Host Count'
    ) as HTMLInputElement
    const projectNameInput = screen.getByLabelText(
      'Project Name'
    ) as HTMLInputElement
    const disabledFieldset = projectNameInput.closest('fieldset')

    await waitFor(() => {
      expect(
        (
          screen.getByRole('button', {
            name: 'Creating Booking…',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
      expect(disabledFieldset instanceof HTMLFieldSetElement).toBe(true)
      expect((disabledFieldset as HTMLFieldSetElement | null)?.disabled).toBe(
        true
      )
    })

    await user.type(projectNameInput, ' Revised')
    expect(projectNameInput.value).toBe('Genome Atlas')

    createBookingRequest.resolve({
      status: 'error',
      message: null,
      error: '100% capacity exceeded for 2026-04-10',
      fieldErrors: {},
      values: createInitialBookingFormValues(),
    })

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        '100% capacity exceeded for 2026-04-10'
      )
      expect((disabledFieldset as HTMLFieldSetElement | null)?.disabled).toBe(
        false
      )
    })

    expect(projectNameInput.value).toBe('Genome Atlas')
    expect(hostCountInput.value).toBe('4')
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
