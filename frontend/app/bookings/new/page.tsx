import {
  getGpuTypes,
  getGramOptions,
  getMemoryOptions,
  getWorkflowTypes,
} from '@/app/actions'
import { BookingForm } from '@/components/booking-form'
import { requireCurrentUser } from '@/lib/server-auth'

type NewBookingPageProps = {
  searchParams?: Promise<{
    start?: string
    end?: string
  }>
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function isValidDateParam(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  return datePattern.test(value)
}

export default async function NewBookingPage({
  searchParams,
}: NewBookingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const startDate = isValidDateParam(resolvedSearchParams?.start)
    ? resolvedSearchParams.start
    : undefined
  const endDate = isValidDateParam(resolvedSearchParams?.end)
    ? resolvedSearchParams.end
    : undefined

  const user = await requireCurrentUser('/bookings/new')
  const [gpuTypes, gramOptions, memoryOptions, workflowTypes] =
    await Promise.all([
      getGpuTypes(),
      getGramOptions(user.auth_mode === 'insecure' ? user.email : undefined),
      getMemoryOptions(user.auth_mode === 'insecure' ? user.email : undefined),
      getWorkflowTypes(),
    ])

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <BookingForm
        gpuTypes={gpuTypes}
        gramOptions={gramOptions}
        memoryOptions={memoryOptions}
        workflowTypes={workflowTypes}
        initialStartDate={startDate}
        initialEndDate={endDate}
      />
    </main>
  )
}
