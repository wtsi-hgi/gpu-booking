import { getBookings, getCapacity, getGpuTypes } from '@/app/actions'
import { CalendarView } from '@/components/calendar-view'

function toDateParam(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function getCurrentMonthBounds() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))

  return {
    start: toDateParam(start),
    end: toDateParam(end),
  }
}

export default async function BookingsPage() {
  const month = getCurrentMonthBounds()
  const [gpuTypes, capacity, bookings] = await Promise.all([
    getGpuTypes(),
    getCapacity(month.start, month.end),
    getBookings(month.start, month.end),
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
        initialMonthIso={month.start}
        initialCapacity={capacity}
        initialBookings={bookings}
        gpuTypes={gpuTypes}
      />
    </main>
  )
}
