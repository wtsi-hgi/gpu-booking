/** @vitest-environment jsdom */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  act,
  cleanup,
  fireEvent,
  render,
  type RenderResult,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancelBookingMock: vi.fn(),
  getCapacityMock: vi.fn(),
  getBookingsMock: vi.fn(),
  getGpuTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  routerPushMock: vi.fn(),
  scrollIntoViewMock: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  cancelBooking: mocks.cancelBookingMock,
  getCapacity: mocks.getCapacityMock,
  getBookings: mocks.getBookingsMock,
  getGpuTypes: mocks.getGpuTypesMock,
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPushMock,
  }),
}))

type BookingStatus =
  | 'unconfirmed'
  | 'confirmed'
  | 'tentative'
  | 'spot'
  | 'rejected'
  | 'cancelled'

function buildCapacity(
  date: string,
  total: number,
  confirmedUsed: number,
  pendingUsed: number,
  gpuTypeId = 1,
  gpuTypeName = 'H100'
) {
  return {
    date,
    gpu_type_id: gpuTypeId,
    gpu_type_name: gpuTypeName,
    total,
    confirmed_used: confirmedUsed,
    pending_used: pendingUsed,
    available: Math.max(total - confirmedUsed - pendingUsed, 0),
    user_used: confirmedUsed + pendingUsed,
    user_percent: total > 0 ? ((confirmedUsed + pendingUsed) / total) * 100 : 0,
    warnings: [],
  }
}

function buildBooking(id: number, status: BookingStatus = 'confirmed') {
  return {
    id,
    user_email: 'user@example.com',
    gpu_type_id: 1,
    gpu_type_name: 'H100',
    gpu_count: 2,
    gram_option_id: 1,
    gram_label: '80GB',
    memory_option_id: 1,
    memory_label: '500GB',
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-03-10',
    end_date: '2026-03-12',
    status,
    alt_email: null,
    project_name: null,
    project_pi: null,
    project_grant_number: null,
    technical_lead: null,
    event_start_date: null,
    event_end_date: null,
    admin_notes: null,
    admin_modified_by: null,
    admin_modified_at: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    warnings: [],
  }
}

function buildBookingWithOverrides(
  id: number,
  overrides: Partial<{
    status: BookingStatus
    start_date: string
    end_date: string
    gpu_type_name: string
    gpu_count: number
    workflow_type_name: string
    user_email: string
  }> = {}
) {
  return {
    ...buildBooking(id, overrides.status ?? 'confirmed'),
    start_date: overrides.start_date ?? '2026-03-10',
    end_date: overrides.end_date ?? '2026-03-12',
    gpu_type_name: overrides.gpu_type_name ?? 'H100',
    gpu_count: overrides.gpu_count ?? 2,
    workflow_type_name: overrides.workflow_type_name ?? 'Training',
    user_email: overrides.user_email ?? 'user@example.com',
  }
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let currentDate = new Date(`${startDate}T00:00:00Z`)
  const rangeEnd = new Date(`${endDate}T00:00:00Z`)

  while (currentDate <= rangeEnd) {
    dates.push(currentDate.toISOString().slice(0, 10))
    currentDate = new Date(currentDate)
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
  }

  return dates
}

async function readGlobalsCss(): Promise<string> {
  return readFile(path.join(process.cwd(), 'app/globals.css'), 'utf8')
}

const calendarSelectionProbeStyleId = 'calendar-selection-probe-styles'

function installCalendarSelectionProbeStyles() {
  document.getElementById(calendarSelectionProbeStyleId)?.remove()

  const style = document.createElement('style')
  style.id = calendarSelectionProbeStyleId
  style.textContent = `
    [data-day-cell="true"][data-current-month="true"] {
      background-color: rgb(255, 255, 255);
      border-color: rgb(226, 232, 240);
    }

    .dark [data-day-cell="true"][data-current-month="true"] {
      background-color: rgb(30, 41, 59);
      border-color: rgb(51, 65, 85);
    }

    .calendar-selection-highlight {
      background-color: rgb(219, 234, 254) !important;
      border-color: rgb(29, 78, 216) !important;
      box-shadow:
        inset 0 0 0 999px rgba(219, 234, 254, 0.9),
        inset 0 0 0 1px rgba(29, 78, 216, 0.65) !important;
    }

    .dark .calendar-selection-highlight {
      background-color: rgb(30, 64, 175) !important;
      border-color: rgb(191, 219, 254) !important;
      box-shadow:
        inset 0 0 0 999px rgba(30, 64, 175, 0.92),
        inset 0 0 0 1px rgba(191, 219, 254, 0.72) !important;
    }
  `

  document.head.append(style)
}

describe('bookings page - F1 calendar grid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
    vi.clearAllMocks()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: mocks.scrollIntoViewMock,
    })

    mocks.getGpuTypesMock.mockResolvedValue([
      {
        id: 1,
        name: 'H100',
        gram_gb: 80,
        system_memory_gb: 500,
        total_count: 40,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'A100',
        gram_gb: 40,
        system_memory_gb: 256,
        total_count: 20,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ])

    mocks.getCapacityMock.mockImplementation(
      async (_startDate: string, _endDate: string, gpuTypeId?: number) => {
        if (gpuTypeId === 1) {
          return [buildCapacity('2026-03-10', 40, 20, 0, 1, 'H100')]
        }

        return [buildCapacity('2026-03-10', 80, 20, 0)]
      }
    )
    mocks.getBookingsMock.mockResolvedValue([buildBooking(1)])
    mocks.cancelBookingMock.mockResolvedValue({
      success: true,
      message: 'Cancelled',
      booking: null,
    })
    mocks.requireCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'insecure',
    })
  })

  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('dark')
    document.getElementById(calendarSelectionProbeStyleId)?.remove()
    vi.useRealTimers()
  })

  it('displays March monthly calendar grid with capacity bars on booked days', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'March' })).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()
    expect(document.querySelector('[data-calendar-grid="true"]')).toBeTruthy()

    const bookedDayCell = document.querySelector('[data-date="2026-03-10"]')
    expect(bookedDayCell).toBeTruthy()
    expect(
      bookedDayCell?.querySelector('[data-capacity-total="80"]')
    ).toBeTruthy()
  })

  it('does not render a misleading calendar header New Booking button', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    expect(screen.queryByRole('button', { name: 'New Booking' })).toBeNull()
  })

  it('shows 50% solid confirmed usage for 20 of 40 confirmed GPUs', async () => {
    mocks.getCapacityMock.mockImplementation(async () => [
      buildCapacity('2026-03-10', 40, 20, 0, 1, 'H100'),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const confirmedSegment = dayCell?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null

    expect(confirmedSegment).toBeTruthy()
    expect(confirmedSegment?.style.width).toBe('50%')
  })

  it('shows stacked solid and hatched capacity portions for confirmed and pending usage', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 15, 5, 1, 'H100'),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const confirmedSegment = dayCell?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    const pendingSegment = dayCell?.querySelector(
      '[data-capacity-segment="pending"]'
    ) as HTMLElement | null

    expect(confirmedSegment?.style.width).toBe('37.5%')
    expect(pendingSegment?.style.width).toBe('12.5%')
  })

  it('shows compact capacity context above the bar and status chips below it while keeping the bar accurate', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 0, 1, 1, 'H100'),
    ])
    mocks.getBookingsMock.mockResolvedValueOnce([
      buildBookingWithOverrides(1, {
        status: 'unconfirmed',
        start_date: '2026-03-10',
        end_date: '2026-03-10',
        gpu_count: 1,
        user_email: 'pending@example.com',
      }),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const pendingSegment = dayCell?.querySelector(
      '[data-capacity-segment="pending"]'
    ) as HTMLElement | null
    const capacityContext = dayCell?.querySelector(
      '[data-day-capacity-context="true"]'
    ) as HTMLElement | null
    const summaryPanel = dayCell?.querySelector(
      '[data-day-usage-summary="true"]'
    ) as HTMLElement | null

    expect(dayCell).toBeTruthy()
    expect(pendingSegment?.style.width).toBe('2.5%')
    expect(capacityContext?.textContent).toBe('1 of 40 GPUs')
    expect(summaryPanel).toBeTruthy()
    expect(
      within(summaryPanel as HTMLElement).queryByText('1 of 40 GPUs')
    ).toBeNull()
    expect(
      within(summaryPanel as HTMLElement).queryByText('1 pending GPU')
    ).toBeNull()
    expect(
      within(summaryPanel as HTMLElement).getByText('1 pending')
    ).toBeTruthy()
    expect(
      within(summaryPanel as HTMLElement).getByText('1 booking')
    ).toBeTruthy()
  })

  it('hides compact capacity context on zero-usage days even when capacity data exists', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 2, 0, 1, 'H100'),
      buildCapacity('2026-03-15', 40, 0, 0, 1, 'H100'),
    ])
    mocks.getBookingsMock.mockResolvedValueOnce([
      buildBookingWithOverrides(1, {
        start_date: '2026-03-10',
        end_date: '2026-03-10',
        gpu_count: 2,
      }),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const bookedDayCell = document.querySelector('[data-date="2026-03-10"]')
    const emptyDayCell = document.querySelector('[data-date="2026-03-15"]')
    const bookedDayContext = bookedDayCell?.querySelector(
      '[data-day-capacity-context="true"]'
    ) as HTMLElement | null

    expect(bookedDayCell).toBeTruthy()
    expect(emptyDayCell).toBeTruthy()
    expect(bookedDayContext?.textContent).toBe('2 of 40 GPUs')
    expect(
      emptyDayCell?.querySelector('[data-day-capacity-context="true"]')
    ).toBeNull()
    expect(screen.queryByText('0 of 40 GPUs')).toBeNull()
  })

  it('navigates to previous month and reloads capacity data', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await vi.runAllTimersAsync()

    expect(screen.getByRole('button', { name: 'February' })).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-02-01',
      '2026-03-14',
      undefined
    )
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-02-01',
      '2026-03-14',
      undefined
    )
  })

  it('uses arrow controls for month and year, and opens a month selector from the month label', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    expect(screen.queryByText('March 2026')).toBeNull()

    expect(screen.queryByRole('button', { name: 'Previous Month' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next Month' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'March' }))

    const monthSelector = document.querySelector('[data-month-selector="true"]')

    expect(monthSelector).toBeTruthy()
    expect(monthSelector?.className).toContain('w-max')
    expect(monthSelector?.className).toContain('min-w-[18rem]')
    expect(monthSelector?.className).toContain('left-0')
    expect(monthSelector?.className).not.toContain('left-1/2')
    expect(monthSelector?.className).not.toContain('-translate-x-1/2')
    expect(monthSelector?.className).toContain('grid-cols-1')
    expect(monthSelector?.className).toContain('sm:grid-cols-2')
    expect(screen.getByRole('button', { name: 'September' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))

    expect(screen.getByText('2027')).toBeTruthy()
  })

  it('shows a persistent today border with no flash animation', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const initialTodayCell = document.querySelector(
      '[data-date="2026-03-15"]'
    ) as HTMLElement | null
    const globalsCss = await readGlobalsCss()

    expect(initialTodayCell?.getAttribute('data-today')).toBe('true')
    expect(initialTodayCell?.className).toContain('calendar-today-indicator')
    expect(initialTodayCell?.className).not.toContain('calendar-today-flash')
    expect(globalsCss).toContain("[data-day-cell='true'][data-today='true']")
    // The today indicator must be border-only (no background fill) and use
    // `--color-primary` so it adapts to both light and dark themes. The
    // visual rule must be keyed to `data-today` rather than the helper class
    // alone, so a misplaced class cannot give non-today cells the strong frame.
    const todayIndicatorRuleMatch = globalsCss.match(
      /\[data-day-cell='true'\]\[data-today='true'\]\s*\{([^}]*)\}/
    )
    expect(todayIndicatorRuleMatch).toBeTruthy()
    const todayIndicatorRuleBody = todayIndicatorRuleMatch?.[1] ?? ''
    expect(todayIndicatorRuleBody).not.toMatch(/background-color:/)
    expect(todayIndicatorRuleBody).toMatch(
      /border-color:\s*var\(--color-primary\)\s*!important/
    )
    expect(todayIndicatorRuleBody).toMatch(
      /box-shadow:[\s\S]*inset 0 0 0 3px\s*var\(--color-primary\)[\s\S]*0 0 0 1px\s*var\(--color-primary\)/
    )

    // The today flash animation has been removed entirely. Lock that in
    // with negative assertions on globals.css.
    expect(globalsCss).not.toContain('calendar-today-flash')
    expect(globalsCss).not.toContain('@keyframes calendar-today-flash')

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await vi.runAllTimersAsync()

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    expect(screen.getByText('March')).toBeTruthy()

    const todayCell = document.querySelector(
      '[data-date="2026-03-15"]'
    ) as HTMLElement | null

    expect(todayCell?.className).toContain('calendar-today-indicator')
    expect(todayCell?.className).not.toContain('calendar-today-flash')
  })

  it('updates capacity display when GPU type filter changes to H100', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCellBefore = document.querySelector('[data-date="2026-03-10"]')
    const confirmedBefore = dayCellBefore?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    expect(confirmedBefore?.style.width).toBe('25%')

    fireEvent.change(screen.getByLabelText('GPU Type'), {
      target: { value: '1' },
    })
    await vi.runAllTimersAsync()

    const dayCellAfter = document.querySelector('[data-date="2026-03-10"]')
    const confirmedAfter = dayCellAfter?.querySelector(
      '[data-capacity-segment="confirmed"]'
    ) as HTMLElement | null
    expect(confirmedAfter?.style.width).toBe('50%')

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-04-11',
      1
    )
  })

  it('renders empty 0% capacity bars for all current-month day cells with no bookings', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([])
    mocks.getBookingsMock.mockResolvedValueOnce([])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const currentMonthCells = Array.from(
      document.querySelectorAll('[data-current-month="true"]')
    )

    expect(currentMonthCells.length).toBe(31)
    expect(
      currentMonthCells.every((cell) =>
        Boolean(cell.querySelector('[data-capacity-total="0"]'))
      )
    ).toBe(true)
  })

  it('opens booking form with single-day range when a day is double-clicked', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    expect(dayCell).toBeTruthy()

    fireEvent.doubleClick(dayCell as Element)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-03-10&end=2026-03-10'
    )
  })

  it('shows selection details for a single-day click and waits for the CTA before navigating', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel).toBeTruthy()
    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-03-10'
    )
    expect(selectionPanel?.getAttribute('data-selection-days')).toBe('1')
    expect(selectionPanel?.getAttribute('data-selection-available')).toBe('60')
    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '1'
    )
    expect(mocks.routerPushMock).not.toHaveBeenCalled()

    const selectionButton = screen.getByRole('button', {
      name: /create booking for selection/i,
    })

    expect(selectionButton.textContent).toContain('60 GPUs available')

    fireEvent.click(selectionButton)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-03-10&end=2026-03-10'
    )
  })

  it('uses a dedicated selection highlight so dark mode stays visible without the old light-mode tint', async () => {
    document.documentElement.classList.add('dark')

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectedDayClassName = dayCell?.getAttribute('class') ?? ''
    const globalsCss = await readGlobalsCss()

    expect(selectedDayClassName).toContain('calendar-selection-highlight')
    expect(selectedDayClassName).not.toContain('border-primary/70')
    expect(selectedDayClassName).not.toContain('bg-primary/15')
    expect(selectedDayClassName).not.toContain('dark:border-primary')
    expect(selectedDayClassName).not.toContain('dark:bg-primary/40')
    expect(globalsCss).toMatch(
      /\.calendar-selection-highlight\s*\{[\s\S]*background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*8%,\s*var\(--color-card\)\s*\)\s*(?:!important)?\s*;[\s\S]*border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*45%,\s*var\(--color-border\)\s*\)\s*(?:!important)?\s*;[\s\S]*box-shadow:\s*inset 0 0 0 999px\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*8%,\s*transparent\),\s*inset 0 0 0 1px\s*color-mix\(in srgb,\s*var\(--color-primary\)\s*12%,\s*transparent\);[\s\S]*\}/
    )
    expect(globalsCss).toMatch(
      /\.dark\s+\.calendar-selection-highlight\s*\{[\s\S]*background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*40%,\s*var\(--color-card\)\s*\)\s*(?:!important)?\s*;[\s\S]*border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*78%,\s*var\(--color-border\)\s*\)\s*(?:!important)?\s*;[\s\S]*box-shadow:\s*inset 0 0 0 999px\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*40%,\s*transparent\),\s*inset 0 0 0 1px\s*color-mix\(in srgb,\s*var\(--color-primary\)\s*60%,\s*transparent\);[\s\S]*\}/
    )
    expect(globalsCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*html:not\(\.light\)\s+\.calendar-selection-highlight\s*\{[\s\S]*background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*40%,\s*var\(--color-card\)\s*\)\s*(?:!important)?\s*;[\s\S]*border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*78%,\s*var\(--color-border\)\s*\)\s*(?:!important)?\s*;[\s\S]*box-shadow:\s*inset 0 0 0 999px\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*40%,\s*transparent\),\s*inset 0 0 0 1px\s*color-mix\(in srgb,\s*var\(--color-primary\)\s*60%,\s*transparent\);[\s\S]*\}[\s\S]*\}/
    )

    document.documentElement.classList.remove('dark')
  })

  it('keeps the light-mode selection highlight subtle (bug 260424-2 B)', async () => {
    // Bug fix (260424-2 B): the light-mode multi-day selection fill was too
    // saturated. The selection must remain visible (still a different fill
    // and border than an unselected neighbour) but the colour-mix
    // percentages must stay below the high-contrast pre-fix values.
    const globalsCss = await readGlobalsCss()

    const lightRuleMatch = globalsCss.match(
      /(?<!\.dark\s)\.calendar-selection-highlight\s*\{([\s\S]*?)\}/
    )
    expect(lightRuleMatch).toBeTruthy()
    const lightRuleBody = lightRuleMatch?.[1] ?? ''

    function extractPercent(pattern: RegExp): number {
      const match = lightRuleBody.match(pattern)
      expect(match).toBeTruthy()
      return Number(match?.[1])
    }

    const backgroundPercent = extractPercent(
      /background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-card\)\s*\)/
    )
    const borderPercent = extractPercent(
      /border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-border\)\s*\)/
    )
    const insetFillPercent = extractPercent(
      /inset 0 0 0 999px\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*transparent\)/
    )
    const insetBorderPercent = extractPercent(
      /inset 0 0 0 1px\s*color-mix\(in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*transparent\)/
    )

    expect(backgroundPercent).toBeLessThanOrEqual(10)
    expect(borderPercent).toBeLessThanOrEqual(50)
    expect(insetFillPercent).toBeLessThanOrEqual(10)
    expect(insetBorderPercent).toBeLessThanOrEqual(15)

    // Selection must still be visible: not zeroed out.
    expect(backgroundPercent).toBeGreaterThan(0)
    expect(borderPercent).toBeGreaterThan(0)
    expect(insetFillPercent).toBeGreaterThan(0)
    expect(insetBorderPercent).toBeGreaterThan(0)

    // Summary highlight should be no stronger than the cell highlight.
    const summaryRuleMatch = globalsCss.match(
      /(?<!\.dark\s)\.calendar-selection-summary-highlight\s*\{([\s\S]*?)\}/
    )
    expect(summaryRuleMatch).toBeTruthy()
    const summaryBody = summaryRuleMatch?.[1] ?? ''
    const summaryBgMatch = summaryBody.match(
      /background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-card\)\s*\)/
    )
    const summaryBorderMatch = summaryBody.match(
      /border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-border\)\s*\)/
    )
    expect(summaryBgMatch).toBeTruthy()
    expect(summaryBorderMatch).toBeTruthy()
    expect(Number(summaryBgMatch?.[1])).toBeLessThanOrEqual(10)
    expect(Number(summaryBorderMatch?.[1])).toBeLessThanOrEqual(20)
  })

  it('renders multi-day selection visibly in dark mode (bug 260424-2 C)', async () => {
    // Bug fix (260424-2 C): in dark mode the multi-day selection was invisible
    // on intermediate cells. Two structural problems:
    //  1. The dark-mode rule lived in `@layer components`, but Tailwind's
    //     `bg-card` utility (applied on the same cell) lives in `@layer
    //     utilities`, which has higher cascade priority. The component-layer
    //     `background-color` was therefore overridden.
    //  2. The colour-mix percentages on the dark rule were too low to read
    //     over the dark card background even when they did render.
    // The fix must (a) place the dark-mode selection rules where they win
    // against Tailwind utilities (outside `@layer components`, OR use
    // `!important`), and (b) bump the dark-mode percentages so the fill and
    // border are clearly visible.
    const globalsCss = await readGlobalsCss()

    const darkRuleMatch = globalsCss.match(
      /\.dark\s+\.calendar-selection-highlight\s*\{([\s\S]*?)\}/
    )
    expect(darkRuleMatch).toBeTruthy()
    const darkBody = darkRuleMatch?.[1] ?? ''

    const darkBgMatch = darkBody.match(
      /background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-card\)\s*\)/
    )
    const darkBorderMatch = darkBody.match(
      /border-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-border\)\s*\)/
    )
    expect(darkBgMatch).toBeTruthy()
    expect(darkBorderMatch).toBeTruthy()
    const darkBgPercent = Number(darkBgMatch?.[1])
    const darkBorderPercent = Number(darkBorderMatch?.[1])
    expect(darkBgPercent).toBeGreaterThanOrEqual(35)
    expect(darkBgPercent).toBeLessThanOrEqual(45)
    expect(darkBorderPercent).toBeGreaterThanOrEqual(70)
    expect(darkBorderPercent).toBeLessThanOrEqual(85)

    // The dark-mode selection rule must out-rank Tailwind's `bg-card`
    // utility (which sits in `@layer utilities`). It is therefore either
    // placed outside `@layer components` entirely, or it uses `!important`.
    const layerComponentsStart = globalsCss.indexOf('@layer components')
    expect(layerComponentsStart).toBeGreaterThanOrEqual(0)
    let depth = 0
    let layerComponentsEnd = -1
    for (let i = layerComponentsStart; i < globalsCss.length; i++) {
      const character = globalsCss[i]
      if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          layerComponentsEnd = i
          break
        }
      }
    }
    expect(layerComponentsEnd).toBeGreaterThan(layerComponentsStart)

    const darkRuleIndex = globalsCss.indexOf(
      '.dark .calendar-selection-highlight'
    )
    const summaryDarkRuleIndex = globalsCss.indexOf(
      '.dark .calendar-selection-summary-highlight'
    )
    const mediaDarkRuleIndex = globalsCss.indexOf(
      'html:not(.light) .calendar-selection-highlight'
    )
    expect(darkRuleIndex).toBeGreaterThanOrEqual(0)
    expect(summaryDarkRuleIndex).toBeGreaterThanOrEqual(0)
    expect(mediaDarkRuleIndex).toBeGreaterThanOrEqual(0)

    const ruleIsOutsideComponents = darkRuleIndex > layerComponentsEnd
    const ruleUsesImportant = /background-color[^;]*!important/i.test(darkBody)
    expect(ruleIsOutsideComponents || ruleUsesImportant).toBe(true)

    const summaryRuleIsOutsideComponents =
      summaryDarkRuleIndex > layerComponentsEnd
    const mediaRuleIsOutsideComponents = mediaDarkRuleIndex > layerComponentsEnd
    expect(summaryRuleIsOutsideComponents || ruleUsesImportant).toBe(true)
    expect(mediaRuleIsOutsideComponents || ruleUsesImportant).toBe(true)

    // Summary highlight must also bump up so the inner pill row reads in dark.
    const darkSummaryMatch = globalsCss.match(
      /\.dark\s+\.calendar-selection-summary-highlight\s*\{([\s\S]*?)\}/
    )
    expect(darkSummaryMatch).toBeTruthy()
    const darkSummaryBody = darkSummaryMatch?.[1] ?? ''
    const darkSummaryBg = darkSummaryBody.match(
      /background-color:\s*color-mix\(\s*in srgb,\s*var\(--color-primary\)\s*([0-9]+)%,\s*var\(--color-card\)\s*\)/
    )
    expect(darkSummaryBg).toBeTruthy()
    expect(Number(darkSummaryBg?.[1])).toBeGreaterThanOrEqual(30)
  })

  it('keeps multi-day selection interiors visibly highlighted in light and dark mode', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    installCalendarSelectionProbeStyles()

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const middleDayCell = document.querySelector('[data-date="2026-03-11"]')
    const endDayCell = document.querySelector('[data-date="2026-03-12"]')
    const unselectedDayCell = document.querySelector('[data-date="2026-03-13"]')

    expect(startDayCell).toBeTruthy()
    expect(middleDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()
    expect(unselectedDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(middleDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)
    fireEvent.mouseUp(endDayCell as Element)

    expect(startDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(middleDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(endDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(unselectedDayCell?.getAttribute('data-drag-selected')).toBe('false')

    const middleDayClassName = middleDayCell?.getAttribute('class') ?? ''
    const globalsCss = await readGlobalsCss()
    const lightSelectedStyle = getComputedStyle(middleDayCell as Element)
    const lightUnselectedStyle = getComputedStyle(unselectedDayCell as Element)

    expect(middleDayClassName).toContain('calendar-selection-highlight')
    expect(globalsCss).toContain('.calendar-selection-highlight')
    expect(globalsCss).toContain('.dark .calendar-selection-highlight')
    expect(globalsCss).toContain(
      'html:not(.light) .calendar-selection-highlight'
    )
    expect(lightSelectedStyle.backgroundColor).toBe('rgb(219, 234, 254)')
    expect(lightSelectedStyle.borderTopColor).toBe('rgb(29, 78, 216)')
    expect(lightSelectedStyle.boxShadow).toContain(
      'inset 0 0 0 999px rgba(219, 234, 254, 0.9)'
    )
    expect(lightSelectedStyle.backgroundColor).not.toBe(
      lightUnselectedStyle.backgroundColor
    )
    expect(lightSelectedStyle.borderTopColor).not.toBe(
      lightUnselectedStyle.borderTopColor
    )

    document.documentElement.classList.add('dark')

    const darkSelectedStyle = getComputedStyle(middleDayCell as Element)
    const darkUnselectedStyle = getComputedStyle(unselectedDayCell as Element)

    expect(darkSelectedStyle.backgroundColor).toBe('rgb(30, 64, 175)')
    expect(darkSelectedStyle.borderTopColor).toBe('rgb(191, 219, 254)')
    expect(darkSelectedStyle.boxShadow).toContain(
      'inset 0 0 0 999px rgba(30, 64, 175, 0.92)'
    )
    expect(darkSelectedStyle.backgroundColor).not.toBe(
      darkUnselectedStyle.backgroundColor
    )
    expect(darkSelectedStyle.borderTopColor).not.toBe(
      darkUnselectedStyle.borderTopColor
    )
  })

  it('uses visible adjacent-month data for overflow cells and selection details', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 80, 20, 0),
      buildCapacity('2026-04-01', 12, 4, 2, 1, 'H100'),
    ])
    mocks.getBookingsMock.mockResolvedValueOnce([
      buildBookingWithOverrides(1, {
        start_date: '2026-03-10',
        end_date: '2026-03-12',
      }),
      buildBookingWithOverrides(2, {
        start_date: '2026-03-31',
        end_date: '2026-04-02',
        gpu_count: 3,
        user_email: 'adjacent@example.com',
        workflow_type_name: 'Inference',
      }),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-04-11'
    )
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-04-11'
    )

    const adjacentDayCell = document.querySelector('[data-date="2026-04-01"]')

    expect(adjacentDayCell).toBeTruthy()
    expect(adjacentDayCell?.getAttribute('data-current-month')).toBe('false')
    expect(
      adjacentDayCell?.querySelector('[data-capacity-total="12"]')
    ).toBeTruthy()

    fireEvent.mouseDown(adjacentDayCell as Element)
    fireEvent.mouseUp(adjacentDayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-04-01'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-04-01'
    )
    expect(selectionPanel?.getAttribute('data-selection-days')).toBe('1')
    expect(selectionPanel?.getAttribute('data-selection-available')).toBe('6')
    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '1'
    )
    expect(screen.getByText('adjacent@example.com')).toBeTruthy()

    const selectionButton = screen.getByRole('button', {
      name: /create booking for selection/i,
    })

    expect(selectionButton.textContent).toContain('6 GPUs available')

    fireEvent.click(selectionButton)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-04-01&end=2026-04-01'
    )
  })

  it('reveals the next month while dragging past the visible grid without duplicating overlap days', async () => {
    const initialCapacity = buildDateRange('2026-03-31', '2026-04-11').map(
      (date) => buildCapacity(date, 40, 0, 0)
    )
    const extendedCapacity = buildDateRange('2026-03-31', '2026-04-18').map(
      (date) => buildCapacity(date, 40, date === '2026-04-18' ? 6 : 0, 0)
    )

    mocks.getCapacityMock.mockImplementation(async (_startDate, endDate) => {
      if (endDate === '2026-05-09') {
        return extendedCapacity
      }

      return initialCapacity
    })
    mocks.getBookingsMock.mockImplementation(async (_startDate, endDate) => {
      if (endDate === '2026-05-09') {
        return [
          buildBookingWithOverrides(2, {
            start_date: '2026-04-16',
            end_date: '2026-04-18',
            user_email: 'extended@example.com',
            workflow_type_name: 'Inference',
          }),
        ]
      }

      return []
    })

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-31"]')
    const initialLastVisibleDayCell = document.querySelector(
      '[data-date="2026-04-11"]'
    )

    expect(startDayCell).toBeTruthy()
    expect(initialLastVisibleDayCell).toBeTruthy()
    expect(document.querySelector('[data-date="2026-04-18"]')).toBeNull()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(initialLastVisibleDayCell as Element)
    await vi.runAllTimersAsync()

    const extendedDayCell = document.querySelector('[data-date="2026-04-18"]')

    expect(extendedDayCell).toBeTruthy()
    expect(document.querySelectorAll('[data-date="2026-04-01"]')).toHaveLength(
      1
    )
    expect(document.querySelectorAll('[data-date="2026-04-11"]')).toHaveLength(
      1
    )

    fireEvent.mouseEnter(extendedDayCell as Element)
    fireEvent.mouseUp(extendedDayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-31'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-04-18'
    )
    expect(selectionPanel?.getAttribute('data-selection-days')).toBe('19')
    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '1'
    )
    expect(screen.getByText('extended@example.com')).toBeTruthy()

    expect(mocks.getCapacityMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-05-09',
      undefined
    )
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-05-09',
      undefined
    )
  })

  it('shows the dragged date range while selecting multiple days', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const middleDayCell = document.querySelector('[data-date="2026-03-12"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')
    const outsideDayCell = document.querySelector('[data-date="2026-03-15"]')

    expect(startDayCell).toBeTruthy()
    expect(middleDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()
    expect(outsideDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)

    expect(startDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(middleDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(endDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(outsideDayCell?.getAttribute('data-drag-selected')).toBe('false')
    expect(mocks.routerPushMock).not.toHaveBeenCalled()
  })

  it('shows least availability and overlapping bookings for a dragged date range before using the CTA', async () => {
    mocks.getCapacityMock.mockResolvedValueOnce([
      buildCapacity('2026-03-10', 40, 10, 0, 1, 'H100'),
      buildCapacity('2026-03-11', 40, 32, 0, 1, 'H100'),
      buildCapacity('2026-03-12', 40, 18, 4, 1, 'H100'),
      buildCapacity('2026-03-13', 40, 8, 0, 1, 'H100'),
      buildCapacity('2026-03-14', 40, 15, 0, 1, 'H100'),
    ])
    mocks.getBookingsMock.mockResolvedValueOnce([
      buildBookingWithOverrides(1, {
        start_date: '2026-03-10',
        end_date: '2026-03-12',
        user_email: 'user@example.com',
      }),
      buildBookingWithOverrides(2, {
        start_date: '2026-03-14',
        end_date: '2026-03-16',
        user_email: 'other@example.com',
        workflow_type_name: 'Inference',
        gpu_count: 1,
      }),
      buildBookingWithOverrides(3, {
        start_date: '2026-03-18',
        end_date: '2026-03-20',
        user_email: 'late@example.com',
      }),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const middleDayCell = document.querySelector('[data-date="2026-03-12"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')
    const outsideDayCell = document.querySelector('[data-date="2026-03-15"]')

    expect(startDayCell).toBeTruthy()
    expect(middleDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()
    expect(outsideDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)
    fireEvent.mouseUp(endDayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-03-14'
    )
    expect(selectionPanel?.getAttribute('data-selection-days')).toBe('5')
    expect(selectionPanel?.getAttribute('data-selection-available')).toBe('8')
    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '2'
    )
    expect(startDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(middleDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(endDayCell?.getAttribute('data-drag-selected')).toBe('true')
    expect(outsideDayCell?.getAttribute('data-drag-selected')).toBe('false')
    expect(mocks.routerPushMock).not.toHaveBeenCalled()

    const selectionButton = screen.getByRole('button', {
      name: /create booking for selection/i,
    })

    expect(selectionButton.textContent).toContain('up to 8 GPUs available')

    fireEvent.click(selectionButton)

    expect(mocks.routerPushMock).toHaveBeenCalledWith(
      '/bookings/new?start=2026-03-10&end=2026-03-14'
    )
  })

  it('commits the current drag selection when mouseup is handled by the window', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')

    expect(startDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)
    fireEvent.mouseUp(window)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-03-14'
    )
  })

  it('hides cancelled bookings from normal selection details and table filters', async () => {
    mocks.getBookingsMock.mockImplementation(async () => [
      buildBookingWithOverrides(1, {
        start_date: '2026-03-15',
        end_date: '2026-03-18',
        user_email: 'active@example.com',
        status: 'confirmed',
      }),
      buildBookingWithOverrides(2, {
        start_date: '2026-03-15',
        end_date: '2026-03-18',
        user_email: 'cancelled@example.com',
        status: 'cancelled',
      }),
    ])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-15"]')
    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '1'
    )
    expect(screen.getByText('active@example.com')).toBeTruthy()
    expect(screen.queryByText('cancelled@example.com')).toBeNull()
    expect(screen.queryByText('cancelled')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))

    await Promise.resolve()
    await Promise.resolve()

    expect(document.querySelector('[data-booking-id="1"]')).toBeTruthy()
    expect(document.querySelector('[data-booking-id="2"]')).toBeNull()

    const statusFilter = screen.getByLabelText('Status')
    expect(
      within(statusFilter).queryByRole('option', { name: 'Cancelled' })
    ).toBeNull()
  })

  it('shows all current and future bookings in table view without an extra status banner', async () => {
    mocks.getBookingsMock.mockImplementation(async (startDate?: string) => {
      if (startDate === '2026-03-15') {
        return [
          buildBookingWithOverrides(1, {
            start_date: '2026-03-20',
            end_date: '2026-03-22',
            user_email: 'march@example.com',
          }),
          buildBookingWithOverrides(2, {
            start_date: '2026-04-08',
            end_date: '2026-04-10',
            user_email: 'april@example.com',
          }),
        ]
      }

      return [
        buildBookingWithOverrides(1, {
          start_date: '2026-03-20',
          end_date: '2026-03-22',
          user_email: 'march@example.com',
        }),
      ]
    })

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    await Promise.resolve()
    await Promise.resolve()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await vi.runAllTimersAsync()
    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))

    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByText('Showing current and future bookings')).toBeNull()
    expect(document.querySelector('[data-booking-id="1"]')).toBeTruthy()
    expect(document.querySelector('[data-booking-id="2"]')).toBeTruthy()
    expect(mocks.getBookingsMock).toHaveBeenCalledWith(
      '2026-03-15',
      undefined,
      undefined
    )
  })

  it('keeps a cancelled booking hidden when switching between table and calendar views', async () => {
    const activeBooking = buildBookingWithOverrides(1, {
      start_date: '2026-03-15',
      end_date: '2026-03-18',
      status: 'confirmed',
    })
    let resolveCancellation:
      | ((value: {
          success: boolean
          message: string
          booking: typeof activeBooking
        }) => void)
      | null = null

    mocks.getBookingsMock.mockImplementation(async () => [activeBooking])
    mocks.cancelBookingMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancellation = resolve
        })
    )

    const cancelledBooking = {
      ...activeBooking,
      status: 'cancelled' as const,
    }

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    await Promise.resolve()
    await Promise.resolve()

    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))

    await Promise.resolve()
    await Promise.resolve()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await act(async () => {
      resolveCancellation?.({
        success: true,
        message: 'Cancelled',
        booking: cancelledBooking,
      })
      await Promise.resolve()
    })

    expect(confirmSpy).toHaveBeenCalled()
    expect(document.querySelector('[data-booking-id="1"]')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }))

    const dayCell = document.querySelector('[data-date="2026-03-15"]')
    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '0'
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))

    expect(document.querySelector('[data-booking-id="1"]')).toBeNull()
  })

  it('applies refreshed bookings to the calendar after switching views', async () => {
    const activeBooking = buildBookingWithOverrides(1, {
      start_date: '2026-03-15',
      end_date: '2026-03-18',
      status: 'confirmed',
    })

    mocks.getBookingsMock.mockImplementation(async () => [activeBooking])

    const { default: BookingsPage } = await import('@/app/bookings/page')
    let renderResult: RenderResult | undefined

    await act(async () => {
      renderResult = render(await BookingsPage())
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.mouseDown(
      document.querySelector('[data-date="2026-03-15"]') as Element
    )
    fireEvent.mouseUp(
      document.querySelector('[data-date="2026-03-15"]') as Element
    )

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )
    expect(selectionPanel?.getAttribute('data-selection-overlap-count')).toBe(
      '1'
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))

    await Promise.resolve()
    await Promise.resolve()

    expect(document.querySelector('[data-booking-id="1"]')).toBeTruthy()

    mocks.getBookingsMock.mockImplementation(async () => [])

    await act(async () => {
      renderResult?.rerender(await BookingsPage())
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }))

    const refreshedSelectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(
      refreshedSelectionPanel?.getAttribute('data-selection-overlap-count')
    ).toBe('0')
  })

  it('deselects a committed single-day selection when the same day is clicked again without dragging', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')

    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    expect(selectionPanel?.getAttribute('data-selection-start')).toBeNull()
    expect(selectionPanel?.getAttribute('data-selection-end')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /clear selection/i,
      })
    ).toBeNull()
    expect(mocks.routerPushMock).not.toHaveBeenCalled()
  })

  it('deselects a committed range when a selected day is clicked again without dragging', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const middleDayCell = document.querySelector('[data-date="2026-03-12"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')

    expect(startDayCell).toBeTruthy()
    expect(middleDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)
    fireEvent.mouseUp(endDayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )
    expect(selectionPanel?.getAttribute('data-selection-end')).toBe(
      '2026-03-14'
    )

    fireEvent.mouseDown(middleDayCell as Element)
    fireEvent.mouseUp(middleDayCell as Element)

    expect(selectionPanel?.getAttribute('data-selection-start')).toBeNull()
    expect(selectionPanel?.getAttribute('data-selection-end')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /jump to selection details/i,
      })
    ).toBeNull()
    expect(mocks.routerPushMock).not.toHaveBeenCalled()
  })

  it('clears selection when clicking outside day cells but keeps it when clicking inside selection details', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')
    const weekdayHeader = screen.getByText('Mon')

    expect(dayCell).toBeTruthy()
    expect(weekdayHeader).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )

    fireEvent.mouseDown(selectionPanel as Element)
    fireEvent.mouseUp(selectionPanel as Element)

    expect(selectionPanel?.getAttribute('data-selection-start')).toBe(
      '2026-03-10'
    )

    fireEvent.mouseDown(weekdayHeader)
    fireEvent.mouseUp(weekdayHeader)

    expect(selectionPanel?.getAttribute('data-selection-start')).toBeNull()
    expect(selectionPanel?.getAttribute('data-selection-end')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /create booking for selection/i,
      })
    ).toBeNull()
  })

  it('shows a jump-to-details affordance on the committed selection and scrolls to the panel', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const startDayCell = document.querySelector('[data-date="2026-03-10"]')
    const endDayCell = document.querySelector('[data-date="2026-03-14"]')

    expect(startDayCell).toBeTruthy()
    expect(endDayCell).toBeTruthy()

    fireEvent.mouseDown(startDayCell as Element)
    fireEvent.mouseEnter(endDayCell as Element)

    expect(
      screen.queryByRole('button', {
        name: /jump to selection details/i,
      })
    ).toBeNull()

    fireEvent.mouseUp(endDayCell as Element)

    const jumpButton = screen.getByRole('button', {
      name: /jump to selection details/i,
    })

    expect(endDayCell?.contains(jumpButton)).toBe(true)

    fireEvent.click(jumpButton)

    expect(mocks.scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(mocks.routerPushMock).not.toHaveBeenCalled()
  })

  it('clears the current selection back to the empty state', async () => {
    const { default: BookingsPage } = await import('@/app/bookings/page')
    render(await BookingsPage())

    const dayCell = document.querySelector('[data-date="2026-03-10"]')

    expect(dayCell).toBeTruthy()

    fireEvent.mouseDown(dayCell as Element)
    fireEvent.mouseUp(dayCell as Element)

    fireEvent.click(
      screen.getByRole('button', {
        name: /clear selection/i,
      })
    )

    const selectionPanel = document.querySelector(
      '[data-selection-panel="true"]'
    )

    expect(selectionPanel?.getAttribute('data-selection-start')).toBeNull()
    expect(selectionPanel?.getAttribute('data-selection-end')).toBeNull()
    expect(selectionPanel?.getAttribute('data-selection-days')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /create booking for selection/i,
      })
    ).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /jump to selection details/i,
      })
    ).toBeNull()
    expect(dayCell?.getAttribute('data-drag-selected')).toBe('false')
    expect(
      screen.queryByText(
        /choose a single day or drag across several days to preview/i
      )
    ).toBeNull()
  })
})
