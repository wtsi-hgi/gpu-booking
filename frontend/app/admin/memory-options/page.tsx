import { getCurrentUser, getGramOptions, getMemoryOptions } from '@/app/actions'
import { MemoryOptionManager } from '@/components/memory-option-manager'

export default async function AdminMemoryOptionsPage() {
  const user = await getCurrentUser()

  if (!user.is_admin) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-muted-foreground mt-2">
          Admin privileges are required to manage memory options.
        </p>
      </main>
    )
  }

  const [gramOptions, memoryOptions] = await Promise.all([
    getGramOptions(user.email),
    getMemoryOptions(user.email),
  ])

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Memory options
        </h1>
        <p className="text-muted-foreground">
          Configure GRAM and system memory choices used by booking forms.
        </p>
      </section>

      <MemoryOptionManager
        gramOptions={gramOptions}
        memoryOptions={memoryOptions}
        devUserEmail={user.auth_mode === 'insecure' ? user.email : undefined}
      />
    </main>
  )
}
