import { getGpuTypes } from '@/app/actions'
import { GpuTypeManager } from '@/components/gpu-type-manager'
import { requireCurrentUser } from '@/lib/server-auth'

export default async function AdminGpuTypesPage() {
  const user = await requireCurrentUser('/admin/gpu-types')

  if (!user.is_admin) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Access Denied</h1>
        <p className="text-muted-foreground mt-3">
          You must be an admin to manage GPU types.
        </p>
      </main>
    )
  }

  const gpuTypes = await getGpuTypes()

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <div className="space-y-2">
        <p className="text-primary text-sm tracking-[0.2em] uppercase">
          Admin Configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Manage GPU Types
        </h1>
        <p className="text-muted-foreground">
          Configure GPU capacity options used by booking requests.
        </p>
      </div>

      <div className="mt-8">
        <GpuTypeManager initialGpuTypes={gpuTypes} />
      </div>
    </main>
  )
}
