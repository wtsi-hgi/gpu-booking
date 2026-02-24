import { getCurrentUser, getWorkflowTypes } from '@/app/actions'
import { WorkflowTypeManager } from '@/components/workflow-type-manager'

export default async function AdminWorkflowTypesPage() {
  const user = await getCurrentUser()

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
      <div className="space-y-2">
        <p className="text-primary text-sm tracking-[0.2em] uppercase">
          Admin Configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Manage Workflow Types
        </h1>
        <p className="text-muted-foreground">
          Configure workflow options available in booking requests.
        </p>
      </div>

      <div className="mt-8">
        <WorkflowTypeManager initialWorkflowTypes={workflowTypes} />
      </div>
    </main>
  )
}
