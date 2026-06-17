/** @vitest-environment jsdom */

import { createElement } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminBookingsPage from '@/app/admin/bookings/page'
import { AdminBookingPanel } from '@/components/admin-booking-panel'
import type { GpuHostType, WorkflowType } from '@/lib/admin-contracts'
import type { BookingResponse } from '@/lib/booking-contracts'

const mocks = vi.hoisted(() => ({
  getBookingsMock: vi.fn(),
  getGpuHostTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  getWorkflowTypesMock: vi.fn(),
  adminUpdateBookingMock: vi.fn(),
  getCapacityMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  getBookings: mocks.getBookingsMock,
  getGpuHostTypes: mocks.getGpuHostTypesMock,
  getWorkflowTypes: mocks.getWorkflowTypesMock,
  adminUpdateBooking: mocks.adminUpdateBookingMock,
  getCapacity: mocks.getCapacityMock,
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}))

function buildBooking(
  overrides: Partial<BookingResponse> = {}
): BookingResponse {
  return {
    id: 1,
    user_email: 'user@example.com',
    gpu_host_type_id: 1,
    gpu_type: 'H100',
    gpu_count: 8,
    host_count: 2,
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-04-01',
    end_date: '2026-04-03',
    status: 'unconfirmed',
    reservation_name: null,
    alt_email: null,
    project_name: 'Genome Atlas',
    project_pi: 'Dr A',
    project_grant_number: 'GR-1',
    technical_lead: 'Lead A',
    event_start_date: '2026-03-30',
    event_end_date: '2026-04-04',
    admin_notes: null,
    admin_modified_by: null,
    admin_modified_at: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    warnings: [],
    ...overrides,
  }
}

const gpuHostTypes: GpuHostType[] = [
  {
    id: 1,
    gpu_type: 'H100',
    gpu_count: 8,
    total_count: 4,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const workflowTypes: WorkflowType[] = [{ id: 1, name: 'Training' }]

function renderPanel(booking: BookingResponse = buildBooking()) {
  render(
    createElement(AdminBookingPanel, {
      initialBookings: [booking],
      gpuHostTypes,
      workflowTypes,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.requireCurrentUserMock.mockResolvedValue({
    email: 'admin@example.com',
    is_admin: true,
    auth_mode: 'insecure',
  })
  mocks.getBookingsMock.mockResolvedValue([buildBooking()])
  mocks.getGpuHostTypesMock.mockResolvedValue(gpuHostTypes)
  mocks.getWorkflowTypesMock.mockResolvedValue(workflowTypes)
  mocks.getCapacityMock.mockResolvedValue([
    {
      date: '2026-04-01',
      gpu_host_type_id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      total: 4,
      confirmed_used: 1,
      pending_used: 0,
      available: 3,
      user_used: 1,
      user_percent: 25,
      warnings: [],
    },
  ])
  mocks.adminUpdateBookingMock.mockResolvedValue({
    status: 'success',
    message: 'Booking updated successfully.',
    error: null,
    booking: buildBooking(),
  })
})

afterEach(() => {
  cleanup()
})

describe('admin bookings page - H2 acceptance tests', () => {
  it('shows full booking table with admin columns for admin users', async () => {
    render(await AdminBookingsPage())

    expect(
      screen.getByRole('heading', { name: 'Manage Bookings' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'GPU Host Type' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Host Count' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Admin Notes' })
    ).toBeTruthy()
  })

  it('opens side panel with host fields, status dropdown, and admin notes when row clicked', async () => {
    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)

    const panel = screen.getByTestId('admin-booking-side-panel')
    const panelQueries = within(panel)

    expect(panelQueries.getByLabelText('Status')).toBeTruthy()
    expect(panelQueries.getByLabelText('Reservation Name')).toBeTruthy()
    expect(panelQueries.getByLabelText('GPU Host Type')).toBeTruthy()
    expect(panelQueries.getByLabelText('Host Count')).toBeTruthy()
    expect(panelQueries.queryByLabelText('GRAM')).toBeNull()
    expect(panelQueries.queryByLabelText('System Memory')).toBeNull()
    expect(panelQueries.getByLabelText('Admin Notes')).toBeTruthy()
  })

  it('updates booking to confirmed on save and shows success toast', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking: buildBooking({
        status: 'confirmed',
        reservation_name: 'Frontier reservation 9',
      }),
    })

    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Status'
      ),
      {
        target: { value: 'confirmed' },
      }
    )
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Reservation Name'
      ),
      {
        target: { value: 'Frontier reservation 9' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.adminUpdateBookingMock).toHaveBeenCalledTimes(1)
      expect(mocks.toastSuccessMock).toHaveBeenCalledWith(
        'Booking updated successfully.'
      )
      expect(screen.getByTestId('status-badge-1').textContent).toContain(
        'Confirmed'
      )
    })

    const submittedFormData = mocks.adminUpdateBookingMock.mock.calls[0]?.[1]
    expect(submittedFormData).toBeInstanceOf(FormData)
    expect((submittedFormData as FormData).get('reservation_name')).toBe(
      'Frontier reservation 9'
    )

    expect(screen.queryByTestId('admin-capacity-warning')).toBeNull()
  })

  it('shows a reservation-name error when confirmed save is rejected', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'error',
      message: null,
      error: 'Reservation name is required when confirming a booking.',
      booking: null,
    })

    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Status'
      ),
      {
        target: { value: 'confirmed' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        'Reservation name is required when confirming a booking.'
      )
      expect(screen.getByRole('alert').textContent).toContain(
        'Reservation name is required'
      )
    })
  })

  it('does not show a capacity warning when confirming within available host capacity', async () => {
    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Status'
      ),
      {
        target: { value: 'confirmed' },
      }
    )

    await waitFor(() => {
      expect(mocks.getCapacityMock).toHaveBeenCalledWith(
        '2026-04-01',
        '2026-04-03',
        1
      )
    })

    expect(screen.queryByTestId('admin-capacity-warning')).toBeNull()
  })

  it('shows capacity error and rejects update when confirmed would exceed host capacity', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      {
        date: '2026-04-01',
        gpu_host_type_id: 1,
        gpu_type: 'H100',
        gpu_count: 8,
        total: 2,
        confirmed_used: 2,
        pending_used: 0,
        available: 0,
        user_used: 2,
        user_percent: 100,
        warnings: [],
      },
    ])
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'error',
      message: null,
      error: 'host capacity exceeded for 2026-04-01',
      booking: null,
    })

    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Status'
      ),
      {
        target: { value: 'confirmed' },
      }
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('admin-capacity-warning').textContent
      ).toContain('exceed host capacity')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        'host capacity exceeded for 2026-04-01'
      )
      expect(screen.getByRole('alert').textContent).toContain(
        'host capacity exceeded'
      )
    })
  })

  it('updates host_count after saving booking changes', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking: buildBooking({ host_count: 3 }),
    })

    renderPanel()

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Host Count'
      ),
      {
        target: { value: '3' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy()
    })
  })
})
