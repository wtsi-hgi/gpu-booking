import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { backendJson } from '@/lib/backend-client'
import { bookingListSchema } from '@/lib/booking-contracts'
import { gpuTypeListSchema } from '@/lib/admin-contracts'

import { getCurrentUser } from '../actions'

const adminSections = [
  {
    title: 'Manage Bookings',
    description: 'Review and update booking requests.',
    href: '/admin/bookings',
  },
  {
    title: 'GPU Types',
    description: 'Configure GPU inventory and capacity.',
    href: '/admin/gpu-types',
  },
  {
    title: 'Workflow Types',
    description: 'Maintain available workflow categories.',
    href: '/admin/workflow-types',
  },
  {
    title: 'Memory Options',
    description: 'Manage GRAM and system memory options.',
    href: '/admin/memory-options',
  },
]

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

async function loadSummaryStats() {
  const monthBounds = getCurrentMonthBounds()

  const [pendingBookings, confirmedBookings, gpuTypes] = await Promise.all([
    backendJson('/api/v1/bookings?status=unconfirmed', bookingListSchema),
    backendJson(
      `/api/v1/bookings?status=confirmed&start_date=${monthBounds.start}&end_date=${monthBounds.end}`,
      bookingListSchema
    ),
    backendJson('/api/v1/gpu-types', gpuTypeListSchema),
  ])

  return {
    pendingBookings: pendingBookings.length,
    confirmedBookingsThisMonth: confirmedBookings.length,
    gpuTypesConfigured: gpuTypes.length,
  }
}

export default async function AdminDashboardPage() {
  const user = await getCurrentUser()

  if (!user.is_admin) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Access Denied</h1>
        <p className="text-muted-foreground mt-2">
          You do not have permission to view this page.
        </p>
      </main>
    )
  }

  const stats = await loadSummaryStats()

  return (
    <main className="container mx-auto max-w-6xl space-y-8 px-4 py-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Manage bookings and administrative reference data.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {adminSections.map((section) => (
          <a key={section.href} href={section.href} className="block">
            <Card className="hover:bg-accent/40 h-full transition-colors">
              <CardHeader>
                <CardTitle className="text-xl">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Bookings</CardTitle>
            <CardDescription>
              Total booking requests awaiting confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {stats.pendingBookings} pending bookings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confirmed This Month</CardTitle>
            <CardDescription>
              Bookings confirmed in the current month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {stats.confirmedBookingsThisMonth} confirmed bookings this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GPU Types Configured</CardTitle>
            <CardDescription>
              Number of GPU types available in the catalog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {stats.gpuTypesConfigured} GPU types configured
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
