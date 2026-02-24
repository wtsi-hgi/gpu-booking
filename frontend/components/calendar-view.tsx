'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { getBookings, getCapacity } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { GpuType } from '@/lib/admin-contracts'
import type { BookingResponse, DailyCapacity } from '@/lib/booking-contracts'
import { cn } from '@/lib/utils'

import { CapacityBar } from './capacity-bar'

type CalendarViewProps = {
  initialMonthIso: string
  initialCapacity: DailyCapacity[]
  initialBookings: BookingResponse[]
  gpuTypes: GpuType[]
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

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
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

export function CalendarView({
  initialMonthIso,
  initialCapacity,
  initialBookings,
  gpuTypes,
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
  const [dragStartDate, setDragStartDate] = useState<string | null>(null)
  const hasMountedRef = useRef(false)

  const monthTitle = monthFormatter.format(currentMonth)
  const monthStart = startOfMonthUtc(currentMonth)
  const monthEnd = endOfMonthUtc(currentMonth)
  const monthStartIso = formatDateParam(monthStart)
  const monthEndIso = formatDateParam(monthEnd)

  const dayCells = useMemo(() => buildMonthCells(monthStart), [monthStart])
  const capacityByDate = useMemo(() => summariseCapacity(capacity), [capacity])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    let cancelled = false

    async function loadMonthData() {
      const [nextCapacity, nextBookings] = await Promise.all([
        getCapacity(monthStartIso, monthEndIso, selectedGpuTypeId),
        getBookings(monthStartIso, monthEndIso, selectedGpuTypeId),
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
  }, [monthEndIso, monthStartIso, selectedGpuTypeId])

  useEffect(() => {
    if (dragStartDate === null) {
      return
    }

    function handleWindowMouseUp() {
      setDragStartDate(null)
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
                      : null
                  )}
                  data-day-cell="true"
                  data-date={day.dateIso}
                  data-current-month={day.inCurrentMonth ? 'true' : 'false'}
                  onDoubleClick={() =>
                    openBookingForm(day.dateIso, day.dateIso)
                  }
                  onMouseDown={() => setDragStartDate(day.dateIso)}
                  onMouseUp={() => {
                    if (!dragStartDate) {
                      return
                    }

                    const [startDate, endDate] = normaliseRange(
                      dragStartDate,
                      day.dateIso
                    )
                    setDragStartDate(null)
                    openBookingForm(startDate, endDate)
                  }}
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
      ) : (
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-booking-table="true">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Dates</th>
                <th className="px-3 py-2 text-left">GPU Type</th>
                <th className="px-3 py-2 text-left">GPU Count</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr>
                  <td className="text-muted-foreground px-3 py-3" colSpan={4}>
                    No bookings found for this month.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-border border-t"
                    data-booking-row="true"
                  >
                    <td className="px-3 py-2">
                      {booking.start_date} to {booking.end_date}
                    </td>
                    <td className="px-3 py-2">{booking.gpu_type_name}</td>
                    <td className="px-3 py-2">{booking.gpu_count}</td>
                    <td className="px-3 py-2 capitalize">{booking.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
