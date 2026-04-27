import type { GpuType, WorkflowType } from '@/lib/admin-contracts'
import type { BookingResponse } from '@/lib/booking-contracts'

export type FormState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  gpuType: GpuType | null
}

export const initialFormState: FormState = {
  status: 'idle',
  message: null,
  error: null,
  gpuType: null,
}

export type WorkflowTypeFormState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  workflowType: WorkflowType | null
  deletedId: number | null
}

export const initialWorkflowTypeFormState: WorkflowTypeFormState = {
  status: 'idle',
  message: null,
  error: null,
  workflowType: null,
  deletedId: null,
}

export type OptionFormState<T> = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  items: T[]
}

export type AdminBookingFormState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  error: string | null
  booking: BookingResponse | null
}

export const initialAdminBookingFormState: AdminBookingFormState = {
  status: 'idle',
  message: null,
  error: null,
  booking: null,
}
