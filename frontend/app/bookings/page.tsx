import { getBookings, getCapacity, getGpuTypes } from '@/app/actions'
import { CalendarView } from '@/components/calendar-view'
import { requireCurrentUser } from '@/lib/server-auth'

function toDateParam(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function getCalendarGridBounds(monthStart: Date) {
  const firstWeekday = monthStart.getUTCDay()
  const start = new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth(),
      1 - firstWeekday
    )
  )
  const end = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + 41
    )
  )

  return {
    start: toDateParam(start),
    end: toDateParam(end),
  }
}

function getCurrentCalendarMonth() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const monthStart = new Date(Date.UTC(year, month, 1))
  const dataWindow = getCalendarGridBounds(monthStart)

  return {
    initialMonthIso: toDateParam(monthStart),
    dataStart: dataWindow.start,
    dataEnd: dataWindow.end,
  }
}

export default async function BookingsPage() {
  const month = getCurrentCalendarMonth()
  const currentUser = await requireCurrentUser('/bookings')
  const [gpuTypes, capacity, bookings] = await Promise.all([
    getGpuTypes(),
    getCapacity(month.dataStart, month.dataEnd),
    getBookings(month.dataStart, month.dataEnd),
  ])

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground">
          View GPU utilisation by month and inspect booking records.
        </p>
      </header>

      <CalendarView
        initialMonthIso={month.initialMonthIso}
        initialCapacity={capacity}
        initialBookings={bookings}
        gpuTypes={gpuTypes}
        currentUserEmail={currentUser.email}
      />
    </main>
  )
}
