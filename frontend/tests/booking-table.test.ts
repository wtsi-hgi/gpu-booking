/** @vitest-environment jsdom */

import { createElement } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelBooking } from '@/app/actions'
import { BookingTable } from '@/components/booking-table'
import type { BookingResponse } from '@/lib/booking-contracts'

vi.mock('@/app/actions', () => ({
  cancelBooking: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

function buildBooking(
  id: number,
  overrides: Partial<BookingResponse> = {}
): BookingResponse {
  return {
    id,
    user_email: `user${id}@example.com`,
    gpu_host_type_id: 1,
    gpu_type: 'H100',
    gpu_count: 8,
    host_count: 2,
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-03-10',
    end_date: '2026-03-12',
    status: 'unconfirmed',
    alt_email: null,
    project_name: `Project ${id}`,
    project_pi: null,
    project_grant_number: null,
    technical_lead: null,
    event_start_date: null,
    event_end_date: null,
    admin_notes: null,
    admin_modified_by: null,
    admin_modified_at: null,
    created_at: `2026-02-${String((id % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    updated_at: '2026-02-01T10:00:00Z',
    warnings: [],
    ...overrides,
  }
}

function renderBookingTable(
  bookings: BookingResponse[],
  isAdmin: boolean,
  currentUserEmail = 'a@b.com',
  showCancelledBookings = false
): void {
  render(
    createElement(BookingTable, {
      bookings,
      isAdmin,
      currentUserEmail,
      showCancelledBookings,
    })
  )
}

function getVisibleBookingRowIds(): number[] {
  return Array.from(document.querySelectorAll('[data-booking-row]')).map(
    (row) => Number(row.getAttribute('data-booking-id'))
  )
}

function getVisibleBookingRowIdsSorted(): number[] {
  return getVisibleBookingRowIds().sort((left, right) => left - right)
}

describe('booking-table G1 acceptance tests', () => {
  it('shows 25 rows on page 1 with page 1 of 2 for 30 bookings', () => {
    const bookings = Array.from({ length: 30 }, (_, index) =>
      buildBooking(index + 1)
    )

    renderBookingTable(bookings, false)

    expect(document.querySelectorAll('[data-booking-row]').length).toBe(25)
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'User Email' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'GPU Host Type' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Host Count' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Start Date' })
    ).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'End Date' })).toBeTruthy()
    expect(
      screen.queryByRole('columnheader', { name: 'Start/End Date' })
    ).toBeNull()
    expect(
      screen.getByRole('columnheader', { name: 'Workflow Type' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Project Name' })
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Created At' })
    ).toBeTruthy()
  })

  it('sorts by status alphabetically and reverses on second click', () => {
    const bookings = [
      buildBooking(1, { status: 'tentative' }),
      buildBooking(2, { status: 'confirmed' }),
      buildBooking(3, { status: 'spot' }),
    ]

    renderBookingTable(bookings, false)

    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    expect(getVisibleBookingRowIds()[0]).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    expect(getVisibleBookingRowIds()[0]).toBe(1)
  }, 10_000)

  it('filters by search text across all text fields', () => {
    const bookings = [
      buildBooking(1, { gpu_type: 'H100' }),
      buildBooking(2, {
        gpu_type: 'A100',
        project_name: 'H100 migration',
      }),
      buildBooking(3, { gpu_type: 'A100', project_name: 'Other project' }),
    ]

    renderBookingTable(bookings, false)

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'H100' },
    })

    expect(getVisibleBookingRowIdsSorted()).toEqual([1, 2])
  })

  it('filters by status dropdown', () => {
    const bookings = [
      buildBooking(1, { status: 'confirmed' }),
      buildBooking(2, { status: 'rejected' }),
      buildBooking(3, { status: 'confirmed' }),
    ]

    renderBookingTable(bookings, false)

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'confirmed' },
    })

    expect(getVisibleBookingRowIdsSorted()).toEqual([1, 3])
  })

  it('filters by GPU host type dropdown', () => {
    const bookings = [
      buildBooking(1, { gpu_type: 'H100' }),
      buildBooking(2, { gpu_type: 'A100' }),
      buildBooking(3, { gpu_type: 'A100' }),
    ]

    renderBookingTable(bookings, false)

    fireEvent.change(screen.getByLabelText('GPU Host Type'), {
      target: { value: '8 GPU A100' },
    })

    expect(getVisibleBookingRowIdsSorted()).toEqual([2, 3])
  })

  it('filters bookings by overlapping date range', () => {
    const bookings = [
      buildBooking(1, { start_date: '2026-02-20', end_date: '2026-03-02' }),
      buildBooking(2, { start_date: '2026-03-10', end_date: '2026-03-12' }),
      buildBooking(3, { start_date: '2026-03-16', end_date: '2026-03-20' }),
    ]

    renderBookingTable(bookings, false)

    fireEvent.change(screen.getByLabelText('Date Start'), {
      target: { value: '2026-03-01' },
    })
    fireEvent.change(screen.getByLabelText('Date End'), {
      target: { value: '2026-03-15' },
    })

    expect(getVisibleBookingRowIdsSorted()).toEqual([1, 2])
  })

  it('shows admin-only columns for admin users', () => {
    const bookings = [
      buildBooking(1, {
        admin_notes: 'Escalated for urgent science programme planning.',
        admin_modified_by: 'admin@example.com',
        admin_modified_at: '2026-02-15T15:00:00Z',
      }),
    ]

    renderBookingTable(bookings, true, 'a@b.com', true)

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

  it('renders created-at timestamps with a deterministic UTC format', () => {
    renderBookingTable(
      [buildBooking(1, { created_at: '2026-04-21T11:51:00Z' })],
      false
    )

    expect(screen.getByText('21 Apr 2026, 11:51')).toBeTruthy()
  })

  it('hides admin-only columns for non-admin users', () => {
    renderBookingTable([buildBooking(1)], false)

    expect(
      screen.queryByRole('columnheader', { name: 'Admin Notes' })
    ).toBeNull()
    expect(
      screen.queryByRole('columnheader', { name: 'Last Modified By' })
    ).toBeNull()
    expect(
      screen.queryByRole('columnheader', { name: 'Last Modified At' })
    ).toBeNull()
  })

  it('renders status as colored badge styles instead of emoji markers', () => {
    const bookings = [
      buildBooking(1, { status: 'confirmed' }),
      buildBooking(2, { status: 'rejected' }),
      buildBooking(3, { status: 'cancelled' }),
      buildBooking(4, { status: 'unconfirmed' }),
    ]

    renderBookingTable(bookings, true, 'a@b.com', true)

    expect(screen.getByTestId('status-badge-1').className).toContain(
      'bg-emerald-100'
    )
    expect(screen.getByTestId('status-badge-2').className).toContain(
      'bg-red-100'
    )
    expect(screen.getByTestId('status-badge-3').className).toContain('bg-muted')
    expect(screen.getByTestId('status-badge-4').className).toContain(
      'bg-amber-100'
    )
    expect(screen.queryByText('🟢')).toBeNull()
    expect(screen.queryByText('🔴')).toBeNull()
  })

  it('truncates admin notes in table and shows full notes when row expands', () => {
    const fullNote =
      'This is a very long admin note that should be truncated in table display and shown fully in details.'

    renderBookingTable(
      [
        buildBooking(1, {
          admin_notes: fullNote,
        }),
      ],
      true
    )

    expect(screen.queryByText(fullNote)).toBeNull()

    const previewCell = document.querySelector('[data-admin-notes-preview]')
    expect(previewCell).toBeTruthy()
    expect(previewCell?.textContent).toContain('…')
    expect(previewCell?.textContent).not.toBe(fullNote)

    const row = document.querySelector('[data-booking-row="true"]')
    expect(row).toBeTruthy()
    fireEvent.click(row as Element)

    const detailRow = document.querySelector('[data-booking-detail-id="1"]')
    expect(detailRow).toBeTruthy()
    expect(detailRow?.textContent).toContain(fullNote)
  })

  it('expands row details with optional booking fields on row click', () => {
    const bookings = [
      buildBooking(1, {
        project_pi: 'Dr Jane Doe',
        project_grant_number: 'GR-12345',
        technical_lead: 'Alex Researcher',
        event_start_date: '2026-04-01',
        event_end_date: '2026-04-03',
        alt_email: 'alt-contact@example.com',
      }),
    ]

    renderBookingTable(bookings, false)

    const row = document.querySelector('[data-booking-row="true"]')
    expect(row).toBeTruthy()

    fireEvent.click(row as Element)

    expect(screen.getByText('Project PI')).toBeTruthy()
    expect(screen.getByText('Dr Jane Doe')).toBeTruthy()
    expect(screen.getByText('Grant Number')).toBeTruthy()
    expect(screen.getByText('GR-12345')).toBeTruthy()
    expect(screen.getByText('Technical Lead')).toBeTruthy()
    expect(screen.getByText('Alex Researcher')).toBeTruthy()
    expect(screen.getByText('Event Start Date')).toBeTruthy()
    expect(screen.getByText('Event End Date')).toBeTruthy()
    expect(screen.getByText('Alternate Email')).toBeTruthy()
    expect(screen.getByText('alt-contact@example.com')).toBeTruthy()
  })
})

describe('booking-table G2 acceptance tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes own unconfirmed booking after cancel confirmation (deleted outcome)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cancelBookingMock = vi.mocked(cancelBooking)
    cancelBookingMock.mockResolvedValueOnce({
      success: true,
      message: 'Booking cancelled successfully.',
      booking: buildBooking(1, {
        user_email: 'a@b.com',
        status: 'unconfirmed',
        admin_modified_at: null,
      }),
    })

    renderBookingTable(
      [
        buildBooking(1, {
          user_email: 'a@b.com',
          status: 'unconfirmed',
          admin_modified_at: null,
        }),
      ],
      false
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(cancelBookingMock).toHaveBeenCalledWith(1)
      expect(document.querySelector('[data-booking-id="1"]')).toBeNull()
    })
  })

  it('removes own admin-edited booking after confirmation when it becomes cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cancelBookingMock = vi.mocked(cancelBooking)
    cancelBookingMock.mockResolvedValueOnce({
      success: true,
      message: 'Booking cancelled successfully.',
      booking: buildBooking(2, {
        user_email: 'a@b.com',
        status: 'cancelled',
        admin_modified_at: '2026-02-15T15:00:00Z',
      }),
    })

    renderBookingTable(
      [
        buildBooking(2, {
          user_email: 'a@b.com',
          status: 'confirmed',
          admin_modified_at: '2026-02-15T15:00:00Z',
        }),
      ],
      false
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(cancelBookingMock).toHaveBeenCalledWith(2)
      expect(document.querySelector('[data-booking-id="2"]')).toBeNull()
    })
  })

  it('does not show cancel button for another user booking', () => {
    renderBookingTable(
      [
        buildBooking(3, {
          user_email: 'other@example.com',
          status: 'unconfirmed',
        }),
      ],
      false
    )

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('does not show cancel button for own cancelled booking', () => {
    renderBookingTable(
      [
        buildBooking(4, {
          user_email: 'a@b.com',
          status: 'cancelled',
        }),
      ],
      false
    )

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('does not show cancel button for own rejected booking', () => {
    renderBookingTable(
      [
        buildBooking(5, {
          user_email: 'a@b.com',
          status: 'rejected',
        }),
      ],
      false
    )

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})
