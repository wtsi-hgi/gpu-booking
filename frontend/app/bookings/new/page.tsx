import { getGpuHostTypes, getWorkflowTypes } from '@/app/actions'
import { BookingForm } from '@/components/booking-form'
import { requireCurrentUser } from '@/lib/server-auth'

type NewBookingPageProps = {
  searchParams?: Promise<{
    start?: string
    end?: string
    gpu_host_type_id?: string
  }>
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const positiveIntegerPattern = /^[1-9]\d*$/

function isValidDateParam(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  return datePattern.test(value)
}

function isValidGpuHostTypeParam(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  return positiveIntegerPattern.test(value)
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
  const gpuHostTypeId = isValidGpuHostTypeParam(
    resolvedSearchParams?.gpu_host_type_id
  )
    ? resolvedSearchParams.gpu_host_type_id
    : undefined

  await requireCurrentUser('/bookings/new')
  const [gpuHostTypes, workflowTypes] = await Promise.all([
    getGpuHostTypes(),
    getWorkflowTypes(),
  ])

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <BookingForm
        gpuHostTypes={gpuHostTypes}
        workflowTypes={workflowTypes}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialGpuHostTypeId={gpuHostTypeId}
      />
    </main>
  )
}
