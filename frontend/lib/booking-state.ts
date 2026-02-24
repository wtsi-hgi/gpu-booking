export const requiredBookingFields = [
  'gpu_type_id',
  'gpu_count',
  'gram_option_id',
  'memory_option_id',
  'workflow_type_id',
  'start_date',
  'end_date',
] as const

export type BookingFieldName = (typeof requiredBookingFields)[number]

export const bookingFieldLabels: Record<BookingFieldName, string> = {
  gpu_type_id: 'GPU Type',
  gpu_count: 'GPU Count',
  gram_option_id: 'GRAM',
  memory_option_id: 'System Memory',
  workflow_type_id: 'Workflow Type',
  start_date: 'Start Date',
  end_date: 'End Date',
}

export type BookingFormState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  fieldErrors: Partial<Record<BookingFieldName, string>>
}

export const initialBookingFormState: BookingFormState = {
  status: 'idle',
  message: null,
  error: null,
  fieldErrors: {},
}

export function buildRequiredFieldErrors(
  fields: BookingFieldName[]
): Partial<Record<BookingFieldName, string>> {
  return fields.reduce<Partial<Record<BookingFieldName, string>>>(
    (errors, field) => {
      errors[field] = `${bookingFieldLabels[field]} is required.`
      return errors
    },
    {}
  )
}
