import { getGpuHostTypes } from '@/app/actions'
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
      <div className="space-y-2">
        <p className="text-primary text-sm tracking-[0.2em] uppercase">
          Admin Configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Manage GPU Host Types
        </h1>
        <p className="text-muted-foreground">
          Configure reservable host shapes and available host counts.
        </p>
      </div>

      <div className="mt-8">
        <GpuHostTypeManager initialGpuHostTypes={gpuHostTypes} />
      </div>
    </main>
  )
}
