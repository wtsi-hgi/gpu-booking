'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

import { cancelBooking } from '@/app/actions'
import { Input } from '@/components/ui/input'
import type { BookingResponse } from '@/lib/booking-contracts'
import { cn } from '@/lib/utils'

type BookingTableProps = {
  bookings: BookingResponse[]
  isAdmin: boolean
  showCancelledBookings?: boolean
  currentUserEmail?: string
  onBookingSelect?: (booking: BookingResponse) => void
  onBookingCancelled?: (
    bookingId: number,
    booking: BookingResponse | null
  ) => void
}

type SortDirection = 'asc' | 'desc'

type SortKey =
  | 'status'
  | 'user_email'
  | 'gpu_type_name'
  | 'gpu_count'
  | 'start_date'
  | 'end_date'
  | 'workflow_type_name'
  | 'project_name'
  | 'created_at'

type StatusVariant = {
  label: string
  className: string
}

const statusOrder = [
  'cancelled',
  'confirmed',
  'rejected',
  'spot',
  'tentative',
  'unconfirmed',
] as const

const statusLabels: Record<string, StatusVariant> = {
  confirmed: {
    label: 'Confirmed',
    className: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  },
  unconfirmed: {
    label: 'Pending',
    className: 'border-amber-200 bg-amber-100 text-amber-800',
  },
  tentative: {
    label: 'Tentative',
    className: 'border-blue-200 bg-blue-100 text-blue-800',
  },
  spot: {
    label: 'Spot',
    className: 'border-orange-200 bg-orange-100 text-orange-800',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-red-200 bg-red-100 text-red-800',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border-muted-foreground/20 bg-muted text-muted-foreground',
  },
}

const PAGE_SIZE = 25
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function formatUtcDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function shouldShowBooking(
  booking: BookingResponse,
  showCancelledBookings: boolean
): boolean {
  return showCancelledBookings || booking.status !== 'cancelled'
}

function filterDisplayableBookings(
  bookings: BookingResponse[],
  showCancelledBookings: boolean
): BookingResponse[] {
  return bookings.filter((booking) =>
    shouldShowBooking(booking, showCancelledBookings)
  )
}

function toDisplayDate(value: string): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return formatUtcDate(date)
}

function toDisplayDateTime(value: string): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${formatUtcDate(date)}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function truncateText(value: string | null, maxLength: number): string {
  if (!value) {
    return '—'
  }
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 1)}…`
}

function buildSearchBlob(booking: BookingResponse): string {
  return [
    booking.status,
    booking.user_email,
    booking.gpu_type_name,
    String(booking.gpu_count),
    booking.start_date,
    booking.end_date,
    booking.workflow_type_name,
    booking.project_name ?? '',
    booking.created_at,
    booking.admin_notes ?? '',
    booking.admin_modified_by ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function overlapsDateRange(
  booking: BookingResponse,
  rangeStart?: string,
  rangeEnd?: string
): boolean {
  if (!rangeStart && !rangeEnd) {
    return true
  }

  const bookingStart = booking.start_date
  const bookingEnd = booking.end_date
  const effectiveStart = rangeStart ?? bookingStart
  const effectiveEnd = rangeEnd ?? bookingEnd

  return bookingStart <= effectiveEnd && bookingEnd >= effectiveStart
}

function getComparableValue(
  booking: BookingResponse,
  key: SortKey
): string | number {
  if (key === 'gpu_count') {
    return booking.gpu_count
  }

  if (key === 'project_name') {
    return booking.project_name ?? ''
  }

  return booking[key]
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

function sortBookings(
  bookings: BookingResponse[],
  key: SortKey,
  direction: SortDirection
): BookingResponse[] {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...bookings].sort((left, right) => {
    const leftValue = getComparableValue(left, key)
    const rightValue = getComparableValue(right, key)
    const comparison = compareValues(leftValue, rightValue)

    if (comparison !== 0) {
      return comparison * multiplier
    }

    return left.id - right.id
  })
}

export function BookingTable({
  bookings,
  isAdmin,
  showCancelledBookings = false,
  currentUserEmail,
  onBookingSelect,
  onBookingCancelled,
}: BookingTableProps) {
  const [visibleBookings, setVisibleBookings] = useState<BookingResponse[]>(
    () => filterDisplayableBookings(bookings, showCancelledBookings)
  )
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [gpuTypeFilter, setGpuTypeFilter] = useState<string>('all')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const [cancellingBookingId, setCancellingBookingId] = useState<number | null>(
    null
  )

  useEffect(() => {
    setVisibleBookings(
      filterDisplayableBookings(bookings, showCancelledBookings)
    )
  }, [bookings, showCancelledBookings])

  useEffect(() => {
    if (!showCancelledBookings && statusFilter === 'cancelled') {
      setStatusFilter('all')
    }
  }, [showCancelledBookings, statusFilter])

  const visibleStatusOrder = useMemo(
    () =>
      statusOrder.filter(
        (status) => showCancelledBookings || status !== 'cancelled'
      ),
    [showCancelledBookings]
  )

  const gpuTypes = useMemo(
    () =>
      Array.from(
        new Set(visibleBookings.map((booking) => booking.gpu_type_name))
      ).sort(),
    [visibleBookings]
  )

  const filteredBookings = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    return visibleBookings.filter((booking) => {
      if (statusFilter !== 'all' && booking.status !== statusFilter) {
        return false
      }

      if (gpuTypeFilter !== 'all' && booking.gpu_type_name !== gpuTypeFilter) {
        return false
      }

      if (
        !overlapsDateRange(
          booking,
          rangeStart || undefined,
          rangeEnd || undefined
        )
      ) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return buildSearchBlob(booking).includes(normalizedSearch)
    })
  }, [
    visibleBookings,
    gpuTypeFilter,
    rangeEnd,
    rangeStart,
    searchText,
    statusFilter,
  ])

  const sortedBookings = useMemo(
    () => sortBookings(filteredBookings, sortKey, sortDirection),
    [filteredBookings, sortDirection, sortKey]
  )

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedBookings = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE
    return sortedBookings.slice(startIndex, startIndex + PAGE_SIZE)
  }, [safeCurrentPage, sortedBookings])

  function updateSort(nextSortKey: SortKey) {
    setCurrentPage(1)
    setSortDirection((currentDirection) => {
      if (nextSortKey !== sortKey) {
        setSortKey(nextSortKey)
        return 'asc'
      }

      return currentDirection === 'asc' ? 'desc' : 'asc'
    })
  }

  function toggleExpandedRow(id: number) {
    setExpandedRowId((current) => (current === id ? null : id))
  }

  function handleRowSelect(booking: BookingResponse) {
    if (onBookingSelect) {
      onBookingSelect(booking)
      return
    }

    toggleExpandedRow(booking.id)
  }

  function canCancelBooking(booking: BookingResponse): boolean {
    if (!currentUserEmail) {
      return false
    }

    if (booking.user_email !== currentUserEmail) {
      return false
    }

    return booking.status !== 'cancelled' && booking.status !== 'rejected'
  }

  async function handleCancelBooking(booking: BookingResponse): Promise<void> {
    const isConfirmed = window.confirm(
      'Cancel this booking? This action cannot be undone.'
    )

    if (!isConfirmed) {
      return
    }

    setCancellingBookingId(booking.id)
    const result = await cancelBooking(booking.id)

    if (result.success) {
      const wasDeleted = !isAdmin && booking.admin_modified_at === null
      const nextBooking = wasDeleted ? null : result.booking

      onBookingCancelled?.(booking.id, nextBooking)

      setVisibleBookings((current) => {
        const next = [...current]
        const index = next.findIndex((item) => item.id === booking.id)

        if (index < 0) {
          return current
        }

        if (result.booking?.status === 'cancelled' && showCancelledBookings) {
          next[index] = {
            ...next[index],
            status: 'cancelled',
          }
          return next
        }

        return next.filter((item) => item.id !== booking.id)
      })
      setExpandedRowId((current) => (current === booking.id ? null : current))
    }

    setCancellingBookingId(null)
  }

  return (
    <section className="space-y-4" data-testid="booking-table">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label
            htmlFor="booking-search"
            className="mb-1 block text-sm font-medium"
          >
            Search
          </label>
          <Input
            id="booking-search"
            placeholder="Search bookings"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value)
              setCurrentPage(1)
            }}
          />
        </div>

        <div>
          <label
            htmlFor="status-filter"
            className="mb-1 block text-sm font-medium"
          >
            Status
          </label>
          <select
            id="status-filter"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setCurrentPage(1)
            }}
          >
            <option value="all">All statuses</option>
            {visibleStatusOrder.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="gpu-type-filter"
            className="mb-1 block text-sm font-medium"
          >
            GPU Type
          </label>
          <select
            id="gpu-type-filter"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={gpuTypeFilter}
            onChange={(event) => {
              setGpuTypeFilter(event.target.value)
              setCurrentPage(1)
            }}
          >
            <option value="all">All GPU types</option>
            {gpuTypes.map((gpuType) => (
              <option key={gpuType} value={gpuType}>
                {gpuType}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <div>
            <label
              htmlFor="date-start-filter"
              className="mb-1 block text-sm font-medium"
            >
              Date Start
            </label>
            <Input
              id="date-start-filter"
              type="date"
              value={rangeStart}
              onChange={(event) => {
                setRangeStart(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
          <div>
            <label
              htmlFor="date-end-filter"
              className="mb-1 block text-sm font-medium"
            >
              Date End
            </label>
            <Input
              id="date-end-filter"
              type="date"
              value={rangeEnd}
              onChange={(event) => {
                setRangeEnd(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        </div>
      </div>

      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full text-sm" data-booking-table="true">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('status')}
                >
                  Status
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('user_email')}
                >
                  User Email
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('gpu_type_name')}
                >
                  GPU Type
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('gpu_count')}
                >
                  GPU Count
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('start_date')}
                >
                  Start Date
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('end_date')}
                >
                  End Date
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('workflow_type_name')}
                >
                  Workflow Type
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('project_name')}
                >
                  Project Name
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium"
                  onClick={() => updateSort('created_at')}
                >
                  Created At
                </button>
              </th>
              {isAdmin ? (
                <>
                  <th className="px-3 py-2 text-left">Admin Notes</th>
                  <th className="px-3 py-2 text-left">Last Modified By</th>
                  <th className="px-3 py-2 text-left">Last Modified At</th>
                </>
              ) : null}
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedBookings.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-3"
                  colSpan={isAdmin ? 13 : 10}
                >
                  No bookings match the current filters.
                </td>
              </tr>
            ) : (
              paginatedBookings.map((booking) => {
                const status = statusLabels[booking.status] ?? {
                  label: booking.status,
                  className:
                    'border-muted-foreground/20 bg-muted text-muted-foreground',
                }
                const isExpanded = expandedRowId === booking.id

                return (
                  <Fragment key={booking.id}>
                    <tr
                      className="border-border hover:bg-muted/30 cursor-pointer border-t"
                      data-booking-row="true"
                      data-booking-id={booking.id}
                      onClick={() => handleRowSelect(booking)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleRowSelect(booking)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium',
                            status.className
                          )}
                          data-testid={`status-badge-${booking.id}`}
                        >
                          <span>{status.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">{booking.user_email}</td>
                      <td className="px-3 py-2">{booking.gpu_type_name}</td>
                      <td className="px-3 py-2">{booking.gpu_count}</td>
                      <td className="px-3 py-2">
                        {toDisplayDate(booking.start_date)}
                      </td>
                      <td className="px-3 py-2">
                        {toDisplayDate(booking.end_date)}
                      </td>
                      <td className="px-3 py-2">
                        {booking.workflow_type_name}
                      </td>
                      <td className="px-3 py-2">
                        {booking.project_name ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {toDisplayDateTime(booking.created_at)}
                      </td>
                      {isAdmin ? (
                        <>
                          <td className="px-3 py-2" data-admin-notes-preview>
                            {truncateText(booking.admin_notes, 40)}
                          </td>
                          <td className="px-3 py-2">
                            {booking.admin_modified_by ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            {booking.admin_modified_at
                              ? toDisplayDateTime(booking.admin_modified_at)
                              : '—'}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-2">
                        {canCancelBooking(booking) ? (
                          <button
                            type="button"
                            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleCancelBooking(booking)
                            }}
                            disabled={cancellingBookingId === booking.id}
                          >
                            Cancel
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr
                        className="bg-muted/20 border-border border-t"
                        data-booking-detail-row="true"
                        data-booking-detail-id={booking.id}
                      >
                        <td className="px-3 py-3" colSpan={isAdmin ? 13 : 10}>
                          <dl className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">
                                Project PI
                              </dt>
                              <dd>{booking.project_pi ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Grant Number
                              </dt>
                              <dd>{booking.project_grant_number ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Technical Lead
                              </dt>
                              <dd>{booking.technical_lead ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Event Start Date
                              </dt>
                              <dd>
                                {toDisplayDate(booking.event_start_date ?? '')}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Event End Date
                              </dt>
                              <dd>
                                {toDisplayDate(booking.event_end_date ?? '')}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Alternate Email
                              </dt>
                              <dd>{booking.alt_email ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">GRAM</dt>
                              <dd>{booking.gram_label}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Memory</dt>
                              <dd>{booking.memory_label}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Warnings
                              </dt>
                              <dd>
                                {booking.warnings.length > 0
                                  ? booking.warnings.join(', ')
                                  : '—'}
                              </dd>
                            </div>
                            {isAdmin ? (
                              <div className="md:col-span-2 lg:col-span-3">
                                <dt className="text-muted-foreground">
                                  Admin Notes
                                </dt>
                                <dd className="break-words whitespace-pre-wrap">
                                  {booking.admin_notes ?? '—'}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" data-booking-pagination>
          Page {safeCurrentPage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'border-input bg-background h-9 rounded-md border px-3 text-sm',
              safeCurrentPage === 1 && 'pointer-events-none opacity-50'
            )}
            onClick={() =>
              setCurrentPage((current) => Math.max(1, current - 1))
            }
          >
            Previous
          </button>
          <button
            type="button"
            className={cn(
              'border-input bg-background h-9 rounded-md border px-3 text-sm',
              safeCurrentPage >= totalPages && 'pointer-events-none opacity-50'
            )}
            onClick={() =>
              setCurrentPage((current) => Math.min(totalPages, current + 1))
            }
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
