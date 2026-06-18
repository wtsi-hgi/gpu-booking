import { getWorkflowTypes } from '@/app/actions'
import { AdminPageHeader } from '@/components/admin-page-header'
import { WorkflowTypeManager } from '@/components/workflow-type-manager'
import { requireCurrentUser } from '@/lib/server-auth'

export default async function AdminWorkflowTypesPage() {
  const user = await requireCurrentUser('/admin/workflow-types')

  if (!user.is_admin) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Access Denied</h1>
        <p className="text-muted-foreground mt-3">
          You must be an admin to manage workflow types.
        </p>
      </main>
    )
  }

  const workflowTypes = await getWorkflowTypes()

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <AdminPageHeader
        eyebrow="Admin Configuration"
        title="Manage Workflow Types"
        description="Configure workflow options available in booking requests."
      />

      <div className="mt-8">
        <WorkflowTypeManager initialWorkflowTypes={workflowTypes} />
      </div>
    </main>
  )
}
