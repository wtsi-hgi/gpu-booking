'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

type DayBookingSummary = {
  activeCount: number
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthNameFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
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

function getTodayUtc(): Date {
  const today = new Date()
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
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

function buildVisibleDayCells(monthStart: Date, monthCount: number): DayCell[] {
  const cells: DayCell[] = []
  const seenDates = new Set<string>()

  for (let monthOffset = 0; monthOffset < monthCount; monthOffset += 1) {
    const monthCells = buildMonthCells(addMonthsUtc(monthStart, monthOffset))

    for (const cell of monthCells) {
      if (seenDates.has(cell.dateIso)) {
        continue
      }

      seenDates.add(cell.dateIso)
      cells.push(cell)
    }
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

function isPendingBookingStatus(status: BookingResponse['status']): boolean {
  return status === 'unconfirmed'
}

function isConfirmedBookingStatus(status: BookingResponse['status']): boolean {
  return status === 'confirmed' || status === 'tentative' || status === 'spot'
}

function shouldShowBookingInNormalView(booking: BookingResponse): boolean {
  return booking.status !== 'cancelled'
}

function summariseBookings(
  entries: BookingResponse[]
): Map<string, DayBookingSummary> {
  const summaries = new Map<string, DayBookingSummary>()

  for (const entry of entries) {
    if (
      !isPendingBookingStatus(entry.status) &&
      !isConfirmedBookingStatus(entry.status)
    ) {
      continue
    }

    for (const dateIso of getInclusiveDateRange(
      entry.start_date,
      entry.end_date
    )) {
      const existing = summaries.get(dateIso)

      if (existing) {
        existing.activeCount += 1
        continue
      }

      summaries.set(dateIso, { activeCount: 1 })
    }
  }

  return summaries
}

function formatCountLabel(
  count: number,
  singular: string,
  plural: string
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatCapacityContext(summary: DailySummary): string {
  const usedGpuCount = summary.confirmedUsed + summary.pendingUsed

  return `${usedGpuCount} of ${summary.total} GPUs`
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

function isDateWithinRange(dateIso: string, range: SelectionRange): boolean {
  return dateIso >= range.startDate && dateIso <= range.endDate
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

function getDayCellDateFromEvent(event: MouseEvent): string | null {
  const targetElement = event.target instanceof Element ? event.target : null
  const targetDayCell = targetElement?.closest('[data-day-cell="true"]')
  const targetDate = targetDayCell?.getAttribute('data-date')

  if (targetDate) {
    return targetDate
  }

  if (typeof document.elementFromPoint !== 'function') {
    return null
  }

  const releasedElement = document.elementFromPoint(event.clientX, event.clientY)
  return (
    releasedElement
      ?.closest('[data-day-cell="true"]')
      ?.getAttribute('data-date') ?? null
  )
}

const monthOptions = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: monthIndex,
  label: monthNameFormatter.format(new Date(Date.UTC(2026, monthIndex, 1))),
}))

export function CalendarView({
  initialMonthIso,
  initialCapacity,
  initialBookings,
  gpuTypes,
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
  const [visibleMonthCount, setVisibleMonthCount] = useState(1)
  const [activeTab, setActiveTab] = useState<'calendar' | 'table'>('calendar')
  const [futureBookings, setFutureBookings] = useState<BookingResponse[]>(() =>
    initialBookings.filter(
      (booking) =>
        shouldShowBookingInNormalView(booking) &&
        booking.end_date >= formatDateParam(getTodayUtc())
    )
  )
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(
    null
  )
  const [dragStartDate, setDragStartDate] = useState<string | null>(null)
  const [dragCurrentDate, setDragCurrentDate] = useState<string | null>(null)
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false)
  const [isTodayHighlighted, setIsTodayHighlighted] = useState(false)
  const hasMountedRef = useRef(false)
  const dragMovedRef = useRef(false)
  const selectionPanelRef = useRef<HTMLDivElement>(null)
  const monthSelectorRef = useRef<HTMLDivElement | null>(null)

  const todayDate = useMemo(() => getTodayUtc(), [])
  const todayIso = formatDateParam(todayDate)
  const monthName = monthNameFormatter.format(currentMonth)
  const yearLabel = String(currentMonth.getUTCFullYear())
  const monthStart = startOfMonthUtc(currentMonth)
  const monthEnd = endOfMonthUtc(currentMonth)
  const monthStartIso = formatDateParam(monthStart)
  const monthEndIso = formatDateParam(monthEnd)

  const dayCells = useMemo(
    () => buildVisibleDayCells(monthStart, visibleMonthCount),
    [monthStart, visibleMonthCount]
  )
  const visibleRangeStartIso = dayCells[0]?.dateIso ?? monthStartIso
  const visibleRangeEndIso =
    dayCells[dayCells.length - 1]?.dateIso ?? monthEndIso
  const capacityByDate = useMemo(() => summariseCapacity(capacity), [capacity])
  const bookingsByDate = useMemo(() => summariseBookings(bookings), [bookings])
  const tableBookings = useMemo(
    () =>
      futureBookings.filter(
        (booking) =>
          shouldShowBookingInNormalView(booking) &&
          booking.end_date >= todayIso
      ),
    [futureBookings, todayIso]
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
          shouldShowBookingInNormalView(booking) &&
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
  const committedSelectionEndDate =
    dragSelection === null ? selectedRange?.endDate : null

  const clearSelection = useCallback(() => {
    setSelectedRange(null)
    setDragStartDate(null)
    setDragCurrentDate(null)
    dragMovedRef.current = false
  }, [])

  const handleBookingCancelled = useCallback(
    (bookingId: number, cancelledBooking: BookingResponse | null) => {
      const updateBookings = (current: BookingResponse[]) => {
        if (cancelledBooking === null) {
          return current.filter((booking) => booking.id !== bookingId)
        }

        return current.map((booking) =>
          booking.id === bookingId ? cancelledBooking : booking
        )
      }

      setBookings(updateBookings)
      setFutureBookings(updateBookings)
    },
    []
  )

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
    let cancelled = false

    async function loadFutureBookings() {
      const nextBookings = await getBookings(todayIso, undefined, selectedGpuTypeId)

      if (cancelled) {
        return
      }

      setFutureBookings(nextBookings)
    }

    void loadFutureBookings()

    return () => {
      cancelled = true
    }
  }, [selectedGpuTypeId, todayIso])

  useEffect(() => {
    if (!isTodayHighlighted) {
      return
    }

    const timeout = window.setTimeout(() => {
      setIsTodayHighlighted(false)
    }, 1600)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isTodayHighlighted])

  useEffect(() => {
    if (!isMonthSelectorOpen) {
      return
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (monthSelectorRef.current?.contains(target)) {
        return
      }

      setIsMonthSelectorOpen(false)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [isMonthSelectorOpen])

  const commitSelection = useCallback(
    (endDate: string) => {
      if (!dragStartDate) {
        return
      }

      const isClickWithoutDrag =
        dragMovedRef.current === false && dragStartDate === endDate

      if (
        isClickWithoutDrag &&
        selectedRange !== null &&
        isDateWithinRange(endDate, selectedRange)
      ) {
        clearSelection()
        return
      }

      const [startDate, normalisedEndDate] = normaliseRange(
        dragStartDate,
        endDate
      )

      setSelectedRange({ startDate, endDate: normalisedEndDate })
      setDragStartDate(null)
      setDragCurrentDate(null)
      dragMovedRef.current = false
    },
    [clearSelection, dragStartDate, selectedRange]
  )

  useEffect(() => {
    if (dragStartDate === null) {
      return
    }

    function handleWindowMouseUp(event: MouseEvent) {
      const releasedDate = getDayCellDateFromEvent(event)

      if (releasedDate !== null) {
        commitSelection(releasedDate)
        return
      }

      if (dragCurrentDate !== null) {
        commitSelection(dragCurrentDate)
        return
      }

      setDragStartDate(null)
      setDragCurrentDate(null)
      dragMovedRef.current = false
    }

    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [commitSelection, dragCurrentDate, dragStartDate])

  useEffect(() => {
    if (selectedRange === null) {
      return
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const selectionPanel = selectionPanelRef.current
      const target = event.target
      const targetElement =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null

      if (
        !(target instanceof Node) ||
        selectionPanel?.contains(target) ||
        targetElement?.closest('[data-day-cell="true"]') !== null
      ) {
        return
      }

      clearSelection()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [clearSelection, selectedRange])

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

  function scrollToSelectionPanel() {
    const panel = selectionPanelRef.current

    if (!panel) {
      return
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    panel.focus({ preventScroll: true })
  }

  function extendVisibleRangeIfNeeded(dateIso: string) {
    if (dragStartDate === null || dateIso !== visibleRangeEndIso) {
      return
    }

    setVisibleMonthCount((currentCount) => currentCount + 1)
  }

  function navigateMonth(offset: number) {
    setCurrentMonth((current) => addMonthsUtc(current, offset))
    setVisibleMonthCount(1)
    setIsMonthSelectorOpen(false)
  }

  function jumpToToday() {
    setCurrentMonth(startOfMonthUtc(todayDate))
    setVisibleMonthCount(1)
    setIsMonthSelectorOpen(false)
    setIsTodayHighlighted(true)
  }

  function navigateYear(offset: number) {
    setCurrentMonth((current) => addMonthsUtc(current, offset * 12))
    setVisibleMonthCount(1)
    setIsMonthSelectorOpen(false)
  }

  function selectMonth(monthIndex: number) {
    setCurrentMonth(
      (current) =>
        new Date(Date.UTC(current.getUTCFullYear(), monthIndex, 1))
    )
    setVisibleMonthCount(1)
    setIsMonthSelectorOpen(false)
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="border-border bg-background inline-flex items-center gap-1 rounded-full border p-1 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => navigateMonth(-1)}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <div ref={monthSelectorRef} className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-3 font-semibold"
                    aria-expanded={isMonthSelectorOpen}
                    aria-haspopup="dialog"
                    onClick={() => setIsMonthSelectorOpen((open) => !open)}
                  >
                    {monthName}
                  </Button>
                  {isMonthSelectorOpen ? (
                    <div
                      className="bg-popover absolute top-full left-1/2 z-20 mt-2 grid min-w-[15rem] -translate-x-1/2 grid-cols-3 gap-1 rounded-xl border p-2 shadow-xl"
                      data-month-selector="true"
                      role="dialog"
                      aria-label="Month selector"
                    >
                      {monthOptions.map((monthOption) => (
                        <Button
                          key={monthOption.value}
                          type="button"
                          variant={
                            monthOption.value === currentMonth.getUTCMonth()
                              ? 'secondary'
                              : 'ghost'
                          }
                          className="h-9 justify-start px-3"
                          onClick={() => selectMonth(monthOption.value)}
                        >
                          {monthOption.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => navigateMonth(1)}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="border-border bg-background inline-flex items-center gap-1 rounded-full border p-1 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous year"
                  onClick={() => navigateYear(-1)}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <div className="min-w-14 px-2 text-center text-sm font-semibold">
                  {yearLabel}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next year"
                  onClick={() => navigateYear(1)}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={jumpToToday}
              >
                Today
              </Button>
            </div>
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
                  const bookingSummary = bookingsByDate.get(day.dateIso) ?? {
                    activeCount: 0,
                  }
                  const usedGpuCount =
                    summary.confirmedUsed + summary.pendingUsed
                  const usagePercent =
                    summary.total > 0 ? (usedGpuCount / summary.total) * 100 : 0
                  const hasDailySummary =
                    usedGpuCount > 0 || bookingSummary.activeCount > 0
                  const isInDragSelection =
                    displayedSelection !== null &&
                    day.dateIso >= displayedSelection.startDate &&
                    day.dateIso <= displayedSelection.endDate
                  const isDragBoundary =
                    displayedSelection !== null &&
                    (day.dateIso === displayedSelection.startDate ||
                      day.dateIso === displayedSelection.endDate)
                  const isToday = day.dateIso === todayIso
                  const isTodayAnimated = isToday && isTodayHighlighted
                  const hasSelectionJump =
                    committedSelectionEndDate !== null &&
                    day.dateIso === committedSelectionEndDate
                  const capacityContext =
                    usedGpuCount > 0 ? formatCapacityContext(summary) : null

                  return (
                    <div
                      key={day.key}
                      className={cn(
                        'border-border relative min-h-24 cursor-pointer rounded border p-2 select-none',
                        day.inCurrentMonth
                          ? 'bg-card'
                          : 'bg-muted/40 text-muted-foreground',
                        usagePercent > 80 && day.inCurrentMonth
                          ? 'bg-destructive/10'
                          : null,
                        isInDragSelection
                          ? 'border-primary/70 bg-primary/15 dark:border-primary/80 dark:bg-primary/25'
                          : null,
                        isDragBoundary ? 'ring-primary/30 ring-1' : null,
                        isToday
                          ? 'ring-primary/25 dark:ring-primary/50 ring-1'
                          : null,
                        isTodayAnimated
                          ? 'bg-primary/20 ring-primary/70 animate-pulse ring-2 dark:bg-primary/35'
                          : null,
                        hasSelectionJump ? 'pb-10' : null
                      )}
                      data-day-cell="true"
                      data-date={day.dateIso}
                      data-current-month={day.inCurrentMonth ? 'true' : 'false'}
                      data-drag-selected={isInDragSelection ? 'true' : 'false'}
                      data-today={isToday ? 'true' : 'false'}
                      data-today-highlighted={isTodayAnimated ? 'true' : 'false'}
                      onDoubleClick={() =>
                        openBookingForm(day.dateIso, day.dateIso)
                      }
                      onMouseDown={() => {
                        dragMovedRef.current = false
                        setDragStartDate(day.dateIso)
                        setDragCurrentDate(day.dateIso)
                      }}
                      onMouseEnter={() => {
                        if (dragStartDate === null) {
                          return
                        }

                        if (day.dateIso !== dragStartDate) {
                          dragMovedRef.current = true
                        }

                        setDragCurrentDate(day.dateIso)
                        extendVisibleRangeIfNeeded(day.dateIso)
                      }}
                      onMouseUp={() => commitSelection(day.dateIso)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          {day.dayNumber}
                        </div>

                        {capacityContext !== null ? (
                          <span
                            className={cn(
                              'text-muted-foreground text-right text-[10px] leading-4 font-medium',
                              !day.inCurrentMonth && 'text-foreground/70'
                            )}
                            data-day-capacity-context="true"
                          >
                            {capacityContext}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2">
                        <CapacityBar
                          total={summary.total}
                          confirmedUsed={summary.confirmedUsed}
                          pendingUsed={summary.pendingUsed}
                        />
                      </div>

                      {hasDailySummary ? (
                        <div
                          className={cn(
                            'border-border/60 bg-background/70 mt-3 flex flex-wrap gap-1.5 rounded-md border px-2 py-2 shadow-sm backdrop-blur-[2px]',
                            !day.inCurrentMonth &&
                              'bg-background/50 text-foreground/80'
                          )}
                          data-day-usage-summary="true"
                        >
                          {summary.confirmedUsed > 0 ? (
                            <span className="border-primary/15 bg-primary/10 text-primary inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                              {formatCountLabel(
                                summary.confirmedUsed,
                                'confirmed',
                                'confirmed'
                              )}
                            </span>
                          ) : null}

                          {summary.pendingUsed > 0 ? (
                            <span className="border-border/70 bg-accent/30 text-foreground inline-flex items-center rounded-full border bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,color-mix(in_oklab,var(--color-foreground)_14%,transparent)_4px,color-mix(in_oklab,var(--color-foreground)_14%,transparent)_8px)] px-2 py-0.5 text-[10px] font-semibold">
                              {formatCountLabel(
                                summary.pendingUsed,
                                'pending',
                                'pending'
                              )}
                            </span>
                          ) : null}

                          {bookingSummary.activeCount > 0 ? (
                            <span className="border-border/70 bg-muted/50 text-muted-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                              {formatCountLabel(
                                bookingSummary.activeCount,
                                'booking',
                                'bookings'
                              )}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {hasSelectionJump ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="border-primary/15 bg-background/95 absolute right-2 bottom-2 z-10 h-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur"
                          aria-label="Jump to selection details"
                          data-selection-jump="true"
                          onMouseDown={(event) => event.stopPropagation()}
                          onMouseUp={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            scrollToSelectionPanel()
                          }}
                        >
                          Details ↓
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            <Card
              ref={selectionPanelRef}
              className="border-primary/30 bg-card/95 scroll-mt-4 shadow-md dark:border-primary/45"
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
              tabIndex={-1}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">Selection details</CardTitle>
                    <CardDescription>
                      {selectionDetails === null
                        ? 'Click a day or drag across the calendar to inspect availability before booking.'
                        : selectionDetails.dayCount === 1
                          ? 'Selected day'
                          : 'Selected range'}
                    </CardDescription>
                  </div>

                  {selectedRange !== null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={clearSelection}
                    >
                      Clear selection
                    </Button>
                  ) : null}
                </div>
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

                    <div className="border-border/80 bg-muted/30 rounded-lg border p-4 dark:border-border">
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
        <div className="space-y-4">
          <div className="border-border/70 bg-muted/20 text-muted-foreground rounded-lg border px-4 py-3 text-sm">
            Showing current and future bookings
          </div>
          <BookingTable
            bookings={tableBookings}
            isAdmin={false}
            currentUserEmail={currentUserEmail}
            onBookingCancelled={handleBookingCancelled}
          />
        </div>
      )}
    </section>
  )
}
