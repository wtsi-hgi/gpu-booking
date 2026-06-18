import { getGpuHostTypes } from '@/app/actions'
import { AdminPageHeader } from '@/components/admin-page-header'
import { GpuHostTypeManager } from '@/components/gpu-host-type-manager'
import { requireCurrentUser } from '@/lib/server-auth'

export default async function AdminGpuHostTypesPage() {
  const user = await requireCurrentUser('/admin/gpu-host-types')

  if (!user.is_admin) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Access Denied</h1>
        <p className="text-muted-foreground mt-3">
          You must be an admin to manage GPU host types.
        </p>
      </main>
    )
  }

  const gpuHostTypes = await getGpuHostTypes()

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <AdminPageHeader
        eyebrow="Admin Configuration"
        title="Manage GPU Host Types"
        description="Configure reservable host shapes and available host counts."
      />

      <div className="mt-8">
        <GpuHostTypeManager initialGpuHostTypes={gpuHostTypes} />
      </div>
    </main>
  )
}
