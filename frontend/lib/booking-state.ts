export const requiredBookingFields = [
  'gpu_host_type_id',
  'host_count',
  'workflow_type_id',
  'start_date',
  'end_date',
] as const

export type BookingFieldName = (typeof requiredBookingFields)[number]

export type BookingFormValueName =
  | BookingFieldName
  | 'alt_email'
  | 'project_name'
  | 'project_pi'
  | 'project_grant_number'
  | 'technical_lead'
  | 'event_start_date'
  | 'event_end_date'

export type BookingFormValues = Record<BookingFormValueName, string>

export const bookingFieldLabels: Record<BookingFieldName, string> = {
  gpu_host_type_id: 'GPU Host Type',
  host_count: 'Host Count',
  workflow_type_id: 'Workflow Type',
  start_date: 'Start Date',
  end_date: 'End Date',
}

export type BookingFormState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  fieldErrors: Partial<Record<BookingFieldName, string>>
  values: BookingFormValues
}

export function createInitialBookingFormValues(
  overrides: Partial<BookingFormValues> = {}
): BookingFormValues {
  return {
    gpu_host_type_id: '',
    host_count: '',
    workflow_type_id: '',
    alt_email: '',
    start_date: '',
    end_date: '',
    project_name: '',
    project_pi: '',
    project_grant_number: '',
    technical_lead: '',
    event_start_date: '',
    event_end_date: '',
    ...overrides,
  }
}

export const initialBookingFormState: BookingFormState = {
  status: 'idle',
  message: null,
  error: null,
  fieldErrors: {},
  values: createInitialBookingFormValues(),
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
