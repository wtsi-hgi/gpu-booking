import { buildRequestInitWithAuth, requireCurrentUser } from '@/lib/server-auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { backendJson } from '@/lib/backend-client'
import { bookingListSchema } from '@/lib/booking-contracts'
import {
  gpuHostTypeListSchema,
  workflowTypeListSchema,
} from '@/lib/admin-contracts'

type SummaryStats = {
  pendingBookings: number
  confirmedBookingsThisMonth: number
  gpuHostTypesConfigured: number
  workflowTypesConfigured: number
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function getAdminSections(stats: SummaryStats) {
  const pendingBookings = pluralize(
    stats.pendingBookings,
    'pending booking',
    'pending bookings'
  )
  const confirmedBookings = pluralize(
    stats.confirmedBookingsThisMonth,
    'confirmed booking',
    'confirmed bookings'
  )
  const gpuHostTypes = pluralize(
    stats.gpuHostTypesConfigured,
    'GPU host type',
    'GPU host types'
  )
  const workflowTypes = pluralize(
    stats.workflowTypesConfigured,
    'workflow type',
    'workflow types'
  )

  return [
    {
      title: 'Manage Bookings',
      description: 'Review and update booking requests.',
      summary: `${pendingBookings}, ${confirmedBookings} this month`,
      href: '/admin/bookings',
    },
    {
      title: 'GPU Host Types',
      description: 'Configure host shapes and availability.',
      summary: `${gpuHostTypes} configured`,
      href: '/admin/gpu-host-types',
    },
    {
      title: 'Workflow Types',
      description: 'Maintain available workflow categories.',
      summary: `${workflowTypes} configured`,
      href: '/admin/workflow-types',
    },
  ]
}

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
  const [
    pendingBookingsRequest,
    confirmedBookingsRequest,
    gpuHostTypesRequest,
    workflowTypesRequest,
  ] = await Promise.all([
    buildRequestInitWithAuth(),
    buildRequestInitWithAuth(),
    buildRequestInitWithAuth(),
    buildRequestInitWithAuth(),
  ])

  const [pendingBookings, confirmedBookings, gpuHostTypes, workflowTypes] =
    await Promise.all([
      backendJson(
        '/api/v1/bookings?status=unconfirmed',
        bookingListSchema,
        pendingBookingsRequest
      ),
      backendJson(
        `/api/v1/bookings?status=confirmed&start_date=${monthBounds.start}&end_date=${monthBounds.end}`,
        bookingListSchema,
        confirmedBookingsRequest
      ),
      backendJson(
        '/api/v1/gpu-host-types',
        gpuHostTypeListSchema,
        gpuHostTypesRequest
      ),
      backendJson(
        '/api/v1/workflow-types',
        workflowTypeListSchema,
        workflowTypesRequest
      ),
    ])

  return {
    pendingBookings: pendingBookings.length,
    confirmedBookingsThisMonth: confirmedBookings.length,
    gpuHostTypesConfigured: gpuHostTypes.length,
    workflowTypesConfigured: workflowTypes.length,
  }
}

export default async function AdminDashboardPage() {
  const user = await requireCurrentUser('/admin')

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
  const adminSections = getAdminSections(stats)

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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <a key={section.href} href={section.href} className="block">
            <Card className="hover:bg-accent/40 h-full transition-colors">
              <CardHeader>
                <CardTitle className="text-xl">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {section.summary}
                </p>
              </CardContent>
            </Card>
          </a>
        ))}
      </section>
    </main>
  )
}
