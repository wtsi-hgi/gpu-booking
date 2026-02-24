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
import type {
  GramOption,
  GpuType,
  MemoryOption,
  WorkflowType,
} from '@/lib/admin-contracts'
import type { BookingResponse } from '@/lib/booking-contracts'

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getBookingsMock: vi.fn(),
  getGpuTypesMock: vi.fn(),
  getGramOptionsMock: vi.fn(),
  getMemoryOptionsMock: vi.fn(),
  getWorkflowTypesMock: vi.fn(),
  adminUpdateBookingMock: vi.fn(),
  getCapacityMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  getCurrentUser: mocks.getCurrentUserMock,
  getBookings: mocks.getBookingsMock,
  getGpuTypes: mocks.getGpuTypesMock,
  getGramOptions: mocks.getGramOptionsMock,
  getMemoryOptions: mocks.getMemoryOptionsMock,
  getWorkflowTypes: mocks.getWorkflowTypesMock,
  adminUpdateBooking: mocks.adminUpdateBookingMock,
  getCapacity: mocks.getCapacityMock,
  initialAdminBookingFormState: {
    status: 'idle',
    message: null,
    error: null,
    booking: null,
  },
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
    gpu_type_id: 1,
    gpu_type_name: 'H100',
    gpu_count: 10,
    gram_option_id: 1,
    gram_label: '80GB',
    memory_option_id: 1,
    memory_label: '500GB',
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-04-01',
    end_date: '2026-04-03',
    status: 'unconfirmed',
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

const gpuTypes: GpuType[] = [
  {
    id: 1,
    name: 'H100',
    gram_gb: 80,
    system_memory_gb: 500,
    total_count: 40,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const gramOptions: GramOption[] = [
  { id: 1, label: '80GB', value_gb: 80, sort_order: 1 },
]
const memoryOptions: MemoryOption[] = [
  { id: 1, label: '500GB', value_gb: 500, sort_order: 1 },
]
const workflowTypes: WorkflowType[] = [{ id: 1, name: 'Training' }]

beforeEach(() => {
  vi.clearAllMocks()

  mocks.getCurrentUserMock.mockResolvedValue({
    email: 'admin@example.com',
    is_admin: true,
    auth_mode: 'insecure',
  })
  mocks.getBookingsMock.mockResolvedValue([buildBooking()])
  mocks.getGpuTypesMock.mockResolvedValue(gpuTypes)
  mocks.getGramOptionsMock.mockResolvedValue(gramOptions)
  mocks.getMemoryOptionsMock.mockResolvedValue(memoryOptions)
  mocks.getWorkflowTypesMock.mockResolvedValue(workflowTypes)
  mocks.getCapacityMock.mockResolvedValue([
    {
      date: '2026-04-01',
      gpu_type_id: 1,
      gpu_type_name: 'H100',
      total: 40,
      confirmed_used: 20,
      pending_used: 0,
      available: 20,
      user_used: 20,
      user_percent: 20,
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
      screen.getByRole('columnheader', { name: 'Admin Notes' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Last Modified By' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Last Modified At' })
    ).toBeTruthy()
  })

  it('opens side panel with editable booking fields, status dropdown, and admin notes when row clicked', async () => {
    render(
      createElement(AdminBookingPanel, {
        initialBookings: [buildBooking()],
        gpuTypes,
        gramOptions,
        memoryOptions,
        workflowTypes,
      })
    )

    const row = document.querySelector('[data-booking-id="1"]')
    expect(row).toBeTruthy()

    fireEvent.click(row as Element)

    const panel = screen.getByTestId('admin-booking-side-panel')
    const panelQueries = within(panel)

    expect(panel).toBeTruthy()
    expect(panelQueries.getByLabelText('Status')).toBeTruthy()
    expect(panelQueries.getByLabelText('GPU Type')).toBeTruthy()
    expect(panelQueries.getByLabelText('GPU Count')).toBeTruthy()
    expect(panelQueries.getByLabelText('Admin Notes')).toBeTruthy()
  })

  it('updates booking to confirmed on save and shows success toast', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking: buildBooking({ status: 'confirmed' }),
    })

    render(
      createElement(AdminBookingPanel, {
        initialBookings: [buildBooking()],
        gpuTypes,
        gramOptions,
        memoryOptions,
        workflowTypes,
      })
    )

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
      expect(mocks.adminUpdateBookingMock).toHaveBeenCalledTimes(1)
      expect(mocks.toastSuccessMock).toHaveBeenCalledWith(
        'Booking updated successfully.'
      )
      expect(screen.getByTestId('status-badge-1').textContent).toContain(
        'Confirmed'
      )
    })
  })

  it('shows capacity error and rejects update when confirmed would exceed capacity', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      {
        date: '2026-04-01',
        gpu_type_id: 1,
        gpu_type_name: 'H100',
        total: 10,
        confirmed_used: 10,
        pending_used: 0,
        available: 0,
        user_used: 10,
        user_percent: 100,
        warnings: [],
      },
    ])
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'error',
      message: null,
      error: '100% capacity exceeded for 2026-04-01',
      booking: null,
    })

    render(
      createElement(AdminBookingPanel, {
        initialBookings: [buildBooking()],
        gpuTypes,
        gramOptions,
        memoryOptions,
        workflowTypes,
      })
    )

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
      ).toContain('exceed 100% capacity')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        '100% capacity exceeded for 2026-04-01'
      )
      expect(screen.getByRole('alert').textContent).toContain(
        '100% capacity exceeded'
      )
    })
  })

  it('saves admin notes and shows modified by metadata in panel footer', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking: buildBooking({
        admin_notes: 'Approved - project priority',
        admin_modified_by: 'admin@example.com',
        admin_modified_at: '2026-02-20T10:30:00Z',
      }),
    })

    render(
      createElement(AdminBookingPanel, {
        initialBookings: [buildBooking()],
        gpuTypes,
        gramOptions,
        memoryOptions,
        workflowTypes,
      })
    )

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'Admin Notes'
      ),
      {
        target: { value: 'Approved - project priority' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        screen.getByText('Last Modified By: admin@example.com')
      ).toBeTruthy()
    })
  })

  it('updates gpu_count from 10 to 15 after saving booking changes', async () => {
    mocks.adminUpdateBookingMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking: buildBooking({ gpu_count: 15 }),
    })

    render(
      createElement(AdminBookingPanel, {
        initialBookings: [buildBooking()],
        gpuTypes,
        gramOptions,
        memoryOptions,
        workflowTypes,
      })
    )

    fireEvent.click(document.querySelector('[data-booking-id="1"]') as Element)
    fireEvent.change(
      within(screen.getByTestId('admin-booking-side-panel')).getByLabelText(
        'GPU Count'
      ),
      {
        target: { value: '15' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('15')).toBeTruthy()
    })
  })
})
