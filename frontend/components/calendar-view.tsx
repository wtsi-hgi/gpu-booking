'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { getBookings, getCapacity } from '@/app/actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { GpuType } from '@/lib/admin-contracts'
import type { BookingResponse, DailyCapacity } from '@/lib/booking-contracts'
import { cn } from '@/lib/utils'

import { CapacityBar } from './capacity-bar'
import { BookingTable } from './booking-table'

type CalendarViewProps = {
  initialMonthIso: string
  initialCapacity: DailyCapacity[]
  initialBookings: BookingResponse[]
  gpuTypes: GpuType[]
  isAdmin: boolean
  currentUserEmail: string
}

type DayCell = {
  key: string
  dateIso: string
  dayNumber: number
  inCurrentMonth: boolean
}

type DailySummary = {
  total: number
  confirmedUsed: number
  pendingUsed: number
}

type SelectionRange = {
  startDate: string
  endDate: string
}

type SelectionAvailability = DailySummary & {
  dateIso: string
  available: number
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function addMonthsUtc(date: Date, offset: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)
  )
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function buildMonthCells(monthStart: Date): DayCell[] {
  const firstWeekday = monthStart.getUTCDay()
  const monthEnd = endOfMonthUtc(monthStart)
  const daysInMonth = monthEnd.getUTCDate()
  const totalCells = 42
  const cells: DayCell[] = []

  for (let index = 0; index < totalCells; index += 1) {
    const offset = index - firstWeekday
    const cellDate = new Date(
      Date.UTC(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth(),
        offset + 1
      )
    )
    const dateIso = formatDateParam(cellDate)

    cells.push({
      key: `${dateIso}-${index}`,
      dateIso,
      dayNumber: cellDate.getUTCDate(),
      inCurrentMonth: cellDate.getUTCMonth() === monthStart.getUTCMonth(),
    })
  }

  if (cells.length !== totalCells || daysInMonth < 28 || daysInMonth > 31) {
    return cells
  }

  return cells
}

function summariseCapacity(
  entries: DailyCapacity[]
): Map<string, DailySummary> {
  const summaries = new Map<string, DailySummary>()

  for (const entry of entries) {
    const existing = summaries.get(entry.date)
    if (existing) {
      existing.total += entry.total
      existing.confirmedUsed += entry.confirmed_used
      existing.pendingUsed += entry.pending_used
      continue
    }

    summaries.set(entry.date, {
      total: entry.total,
      confirmedUsed: entry.confirmed_used,
      pendingUsed: entry.pending_used,
    })
  }

  return summaries
}

function normaliseRange(startDate: string, endDate: string): [string, string] {
  return startDate <= endDate ? [startDate, endDate] : [endDate, startDate]
}

function getInclusiveDateRange(startDate: string, endDate: string): string[] {
  const [normalisedStart, normalisedEnd] = normaliseRange(startDate, endDate)
  const dates: string[] = []
  let currentDate = parseIsoDate(normalisedStart)
  const rangeEnd = parseIsoDate(normalisedEnd)

  while (currentDate <= rangeEnd) {
    dates.push(formatDateParam(currentDate))
    currentDate = new Date(
      Date.UTC(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth(),
        currentDate.getUTCDate() + 1
      )
    )
  }

  return dates
}

function getAvailabilitySummary(summary?: DailySummary): SelectionAvailability {
  const safeSummary = summary ?? {
    total: 0,
    confirmedUsed: 0,
    pendingUsed: 0,
  }

  return {
    dateIso: '',
    total: safeSummary.total,
    confirmedUsed: safeSummary.confirmedUsed,
    pendingUsed: safeSummary.pendingUsed,
    available: Math.max(
      safeSummary.total - safeSummary.confirmedUsed - safeSummary.pendingUsed,
      0
    ),
  }
}

function formatDisplayDate(dateIso: string): string {
  return dateFormatter.format(parseIsoDate(dateIso))
}

function formatDisplayRange(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatDisplayDate(startDate)
  }

  return `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`
}

export function CalendarView({
  initialMonthIso,
  initialCapacity,
  initialBookings,
  gpuTypes,
  isAdmin,
  currentUserEmail,
}: CalendarViewProps) {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    startOfMonthUtc(parseIsoDate(initialMonthIso))
  )
  const [capacity, setCapacity] = useState<DailyCapacity[]>(initialCapacity)
  const [bookings, setBookings] = useState<BookingResponse[]>(initialBookings)
  const [selectedGpuTypeId, setSelectedGpuTypeId] = useState<
    number | undefined
  >(undefined)
  const [activeTab, setActiveTab] = useState<'calendar' | 'table'>('calendar')
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(
    null
  )
  const [dragStartDate, setDragStartDate] = useState<string | null>(null)
  const [dragCurrentDate, setDragCurrentDate] = useState<string | null>(null)
  const hasMountedRef = useRef(false)

  const monthTitle = monthFormatter.format(currentMonth)
  const monthStart = startOfMonthUtc(currentMonth)
  const monthEnd = endOfMonthUtc(currentMonth)
  const monthStartIso = formatDateParam(monthStart)
  const monthEndIso = formatDateParam(monthEnd)

  const dayCells = useMemo(() => buildMonthCells(monthStart), [monthStart])
  const visibleRangeStartIso = dayCells[0]?.dateIso ?? monthStartIso
  const visibleRangeEndIso =
    dayCells[dayCells.length - 1]?.dateIso ?? monthEndIso
  const capacityByDate = useMemo(() => summariseCapacity(capacity), [capacity])
  const tableBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.start_date <= monthEndIso && booking.end_date >= monthStartIso
      ),
    [bookings, monthEndIso, monthStartIso]
  )
  const dragSelection = useMemo(() => {
    if (dragStartDate === null) {
      return null
    }

    const [startDate, endDate] = normaliseRange(
      dragStartDate,
      dragCurrentDate ?? dragStartDate
    )

    return { startDate, endDate }
  }, [dragCurrentDate, dragStartDate])
  const displayedSelection = dragSelection ?? selectedRange
  const selectionDetails = useMemo(() => {
    if (displayedSelection === null) {
      return null
    }

    const dateRange = getInclusiveDateRange(
      displayedSelection.startDate,
      displayedSelection.endDate
    )
    const availabilityByDate = dateRange.map((dateIso) => {
      const summary = getAvailabilitySummary(capacityByDate.get(dateIso))
      return {
        ...summary,
        dateIso,
      }
    })
    const tightestAvailability = availabilityByDate.reduce((lowest, current) =>
      current.available < lowest.available ? current : lowest
    )
    const overlappingBookings = bookings
      .filter(
        (booking) =>
          booking.start_date <= displayedSelection.endDate &&
          booking.end_date >= displayedSelection.startDate
      )
      .sort((left, right) => {
        if (left.start_date === right.start_date) {
          return left.id - right.id
        }

        return left.start_date.localeCompare(right.start_date)
      })

    return {
      dayCount: dateRange.length,
      overlappingBookings,
      tightestAvailability,
    }
  }, [bookings, capacityByDate, displayedSelection])
  const selectionCtaLabel =
    selectionDetails === null
      ? 'Create booking for selection'
      : selectionDetails.dayCount === 1
        ? `Create booking for selection (${selectionDetails.tightestAvailability.available} GPUs available)`
        : `Create booking for selection (up to ${selectionDetails.tightestAvailability.available} GPUs available)`

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    let cancelled = false

    async function loadMonthData() {
      const [nextCapacity, nextBookings] = await Promise.all([
        getCapacity(
          visibleRangeStartIso,
          visibleRangeEndIso,
          selectedGpuTypeId
        ),
        getBookings(
          visibleRangeStartIso,
          visibleRangeEndIso,
          selectedGpuTypeId
        ),
      ])

      if (cancelled) {
        return
      }

      setCapacity(nextCapacity)
      setBookings(nextBookings)
    }

    void loadMonthData()

    return () => {
      cancelled = true
    }
  }, [selectedGpuTypeId, visibleRangeEndIso, visibleRangeStartIso])

  useEffect(() => {
    if (dragStartDate === null) {
      return
    }

    function handleWindowMouseUp() {
      setDragStartDate(null)
      setDragCurrentDate(null)
    }

    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [dragStartDate])

  function openBookingForm(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) {
      router.push('/bookings/new')
      return
    }

    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
    })

    router.push(`/bookings/new?${params.toString()}`)
  }

  function commitSelection(endDate: string) {
    if (!dragStartDate) {
      return
    }

    const [startDate, normalisedEndDate] = normaliseRange(
      dragStartDate,
      endDate
    )

    setSelectedRange({ startDate, endDate: normalisedEndDate })
    setDragStartDate(null)
    setDragCurrentDate(null)
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="border-border inline-flex rounded-md border p-1"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'calendar'}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium',
              activeTab === 'calendar'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground'
            )}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'table'}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium',
              activeTab === 'table'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground'
            )}
            onClick={() => setActiveTab('table')}
          >
            Table
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="gpu-filter" className="text-muted-foreground text-sm">
            GPU Type
          </label>
          <select
            id="gpu-filter"
            className="border-border bg-background rounded border px-2 py-1 text-sm"
            value={selectedGpuTypeId ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setSelectedGpuTypeId(value ? Number(value) : undefined)
            }}
          >
            <option value="">All GPU types</option>
            {gpuTypes.map((gpuType) => (
              <option key={gpuType.id} value={gpuType.id}>
                {gpuType.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCurrentMonth((current) => addMonthsUtc(current, -1))
                }
              >
                Previous Month
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCurrentMonth((current) => addMonthsUtc(current, 1))
                }
              >
                Next Month
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentMonth(startOfMonthUtc(new Date()))}
              >
                Today
              </Button>
              <Button type="button" onClick={() => openBookingForm()}>
                New Booking
              </Button>
            </div>
            <h2
              className="text-lg font-semibold"
              data-month-label={monthStartIso}
            >
              {monthTitle}
            </h2>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
            <div className="space-y-3">
              <div className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs font-medium">
                {weekdayLabels.map((weekday) => (
                  <div key={weekday} className="py-1">
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1" data-calendar-grid="true">
                {dayCells.map((day) => {
                  const summary = capacityByDate.get(day.dateIso) ?? {
                    total: 0,
                    confirmedUsed: 0,
                    pendingUsed: 0,
                  }
                  const usagePercent =
                    summary.total > 0
                      ? ((summary.confirmedUsed + summary.pendingUsed) /
                          summary.total) *
                        100
                      : 0
                  const isInDragSelection =
                    displayedSelection !== null &&
                    day.dateIso >= displayedSelection.startDate &&
                    day.dateIso <= displayedSelection.endDate
                  const isDragBoundary =
                    displayedSelection !== null &&
                    (day.dateIso === displayedSelection.startDate ||
                      day.dateIso === displayedSelection.endDate)

                  return (
                    <div
                      key={day.key}
                      className={cn(
                        'border-border min-h-24 cursor-pointer rounded border p-2 select-none',
                        day.inCurrentMonth
                          ? 'bg-card'
                          : 'bg-muted/40 text-muted-foreground',
                        usagePercent > 80 && day.inCurrentMonth
                          ? 'bg-destructive/10'
                          : null,
                        isInDragSelection
                          ? 'border-primary/50 bg-primary/10'
                          : null,
                        isDragBoundary ? 'ring-primary/30 ring-1' : null
                      )}
                      data-day-cell="true"
                      data-date={day.dateIso}
                      data-current-month={day.inCurrentMonth ? 'true' : 'false'}
                      data-drag-selected={isInDragSelection ? 'true' : 'false'}
                      onDoubleClick={() =>
                        openBookingForm(day.dateIso, day.dateIso)
                      }
                      onMouseDown={() => {
                        setDragStartDate(day.dateIso)
                        setDragCurrentDate(day.dateIso)
                      }}
                      onMouseEnter={() => {
                        if (dragStartDate === null) {
                          return
                        }

                        setDragCurrentDate(day.dateIso)
                      }}
                      onMouseUp={() => commitSelection(day.dateIso)}
                    >
                      <div className="text-sm font-medium">{day.dayNumber}</div>
                      <div className="mt-2">
                        <CapacityBar
                          total={summary.total}
                          confirmedUsed={summary.confirmedUsed}
                          pendingUsed={summary.pendingUsed}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <Card
              className="border-primary/10 bg-card/95"
              data-selection-panel="true"
              data-selection-start={displayedSelection?.startDate}
              data-selection-end={displayedSelection?.endDate}
              data-selection-days={selectionDetails?.dayCount}
              data-selection-available={
                selectionDetails?.tightestAvailability.available
              }
              data-selection-overlap-count={
                selectionDetails?.overlappingBookings.length
              }
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Selection details</CardTitle>
                <CardDescription>
                  {selectionDetails === null
                    ? 'Click a day or drag across the calendar to inspect availability before booking.'
                    : selectionDetails.dayCount === 1
                      ? 'Selected day'
                      : 'Selected range'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectionDetails === null || displayedSelection === null ? (
                  <div className="border-border/70 text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-4 text-sm">
                    Choose a single day or drag across several days to preview
                    the best-fit booking window without leaving this page.
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs font-semibold tracking-[0.24em] uppercase">
                        {selectionDetails.dayCount === 1
                          ? 'Selected day'
                          : 'Selected range'}
                      </p>
                      <p className="text-base font-semibold">
                        {formatDisplayRange(
                          displayedSelection.startDate,
                          displayedSelection.endDate
                        )}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {selectionDetails.dayCount === 1
                          ? '1 day selected'
                          : `${selectionDetails.dayCount} days selected`}
                      </p>
                    </div>

                    <div className="border-border/70 bg-muted/30 rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {selectionDetails.dayCount === 1
                              ? 'Availability for selected day'
                              : 'Least availability across selection'}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {selectionDetails.dayCount === 1
                              ? formatDisplayDate(
                                  selectionDetails.tightestAvailability.dateIso
                                )
                              : `${formatDisplayDate(
                                  selectionDetails.tightestAvailability.dateIso
                                )} is the tightest day in this range.`}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-semibold">
                            {selectionDetails.tightestAvailability.available}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            available GPUs
                          </p>
                        </div>
                      </div>

                      <CapacityBar
                        className="mt-3 h-4"
                        total={selectionDetails.tightestAvailability.total}
                        confirmedUsed={
                          selectionDetails.tightestAvailability.confirmedUsed
                        }
                        pendingUsed={
                          selectionDetails.tightestAvailability.pendingUsed
                        }
                      />

                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Total</dt>
                          <dd className="font-medium">
                            {selectionDetails.tightestAvailability.total}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Confirmed</dt>
                          <dd className="font-medium">
                            {
                              selectionDetails.tightestAvailability
                                .confirmedUsed
                            }
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Pending</dt>
                          <dd className="font-medium">
                            {selectionDetails.tightestAvailability.pendingUsed}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          Overlapping bookings
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {selectionDetails.overlappingBookings.length === 0
                            ? 'No bookings overlap this selection.'
                            : `${selectionDetails.overlappingBookings.length} booking${selectionDetails.overlappingBookings.length === 1 ? '' : 's'} overlap this selection.`}
                        </p>
                      </div>

                      {selectionDetails.overlappingBookings.length === 0 ? (
                        <div className="border-border/70 text-muted-foreground bg-muted/10 rounded-lg border border-dashed p-3 text-sm">
                          No bookings overlap this selection.
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {selectionDetails.overlappingBookings.map(
                            (booking) => (
                              <li
                                key={booking.id}
                                className="border-border/70 bg-background/60 rounded-lg border p-3"
                                data-overlapping-booking="true"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-medium">
                                      {booking.gpu_count} ×{' '}
                                      {booking.gpu_type_name} ·{' '}
                                      {booking.workflow_type_name}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {formatDisplayRange(
                                        booking.start_date,
                                        booking.end_date
                                      )}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                      {booking.user_email}
                                    </p>
                                  </div>
                                  <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize">
                                    {booking.status}
                                  </span>
                                </div>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      onClick={() =>
                        openBookingForm(
                          displayedSelection.startDate,
                          displayedSelection.endDate
                        )
                      }
                    >
                      {selectionCtaLabel}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <BookingTable
          bookings={tableBookings}
          isAdmin={isAdmin}
          currentUserEmail={currentUserEmail}
        />
      )}
    </section>
  )
}
