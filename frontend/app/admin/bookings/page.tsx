import {
  getBookings,
  getGpuTypes,
  getGramOptions,
  getMemoryOptions,
  getWorkflowTypes,
} from '@/app/actions'
import { AdminBookingPanel } from '@/components/admin-booking-panel'
import { requireCurrentUser } from '@/lib/server-auth'

export default async function AdminBookingsPage() {
  const user = await requireCurrentUser('/admin/bookings')

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

  const [bookings, gpuTypes, gramOptions, memoryOptions, workflowTypes] =
    await Promise.all([
      getBookings(),
      getGpuTypes(),
      getGramOptions(user.auth_mode === 'insecure' ? user.email : undefined),
      getMemoryOptions(user.auth_mode === 'insecure' ? user.email : undefined),
      getWorkflowTypes(),
    ])

  return (
    <main className="container mx-auto max-w-7xl space-y-4 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Manage Bookings
        </h1>
        <p className="text-muted-foreground">
          Review and edit booking requests across all users.
        </p>
      </header>

      <AdminBookingPanel
        initialBookings={bookings}
        gpuTypes={gpuTypes}
        gramOptions={gramOptions}
        memoryOptions={memoryOptions}
        workflowTypes={workflowTypes}
      />
    </main>
  )
}
