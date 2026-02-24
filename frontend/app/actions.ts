'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { backendJson } from '@/lib/backend-client'
import {
  gramOptionListSchema,
  gramOptionSchema,
  gpuTypeListSchema,
  gpuTypeSchema,
  memoryOptionListSchema,
  memoryOptionSchema,
  workflowTypeListSchema,
  workflowTypeSchema,
  type GramOption,
  type GpuType,
  type MemoryOption,
  type WorkflowType,
} from '@/lib/admin-contracts'
import { userInfoSchema, type UserInfo } from '@/lib/auth-contracts'
import { healthResponseSchema, messageResponseSchema } from '@/lib/contracts'
import { type GreetingState } from '@/lib/greeting-state'
import {
  bookingListSchema,
  bookingResponseSchema,
  bookingValidationSchema,
  dailyCapacityListSchema,
  type BookingResponse,
  type BookingValidation,
  type DailyCapacity,
} from '@/lib/booking-contracts'
import {
  buildRequiredFieldErrors,
  type BookingFieldName,
  type BookingFormState,
} from '@/lib/booking-state'

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

function parsePositiveInteger(formData: FormData, key: string): number | null {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

function parseRequiredString(formData: FormData, key: string): string {
  const value = (formData.get(key) ?? '').toString().trim()
  if (!value) {
    throw new Error(`Missing ${key}`)
  }
  return value
}

function parseRequiredInteger(formData: FormData, key: string): number {
  const value = Number.parseInt((formData.get(key) ?? '').toString(), 10)
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

function getDevUserFromFormData(formData: FormData): string | undefined {
  const value = (formData.get('dev_user_email') ?? '').toString().trim()
  return value || undefined
}

function parseOptionalString(formData: FormData, key: string): string | null {
  const value = (formData.get(key) ?? '').toString().trim()
  return value.length > 0 ? value : null
}

type ParsedBookingPayload = {
  payload: {
    gpu_type_id: number
    gpu_count: number
    gram_option_id: number
    memory_option_id: number
    workflow_type_id: number
    start_date: string
    end_date: string
    alt_email: string | null
    project_name: string | null
    project_pi: string | null
    project_grant_number: string | null
    technical_lead: string | null
    event_start_date: string | null
    event_end_date: string | null
  } | null
  fieldErrors: Partial<Record<BookingFieldName, string>>
}

function parseBookingPayload(formData: FormData): ParsedBookingPayload {
  const requiredValues = {
    gpu_type_id: (formData.get('gpu_type_id') ?? '').toString().trim(),
    gpu_count: (formData.get('gpu_count') ?? '').toString().trim(),
    gram_option_id: (formData.get('gram_option_id') ?? '').toString().trim(),
    memory_option_id: (formData.get('memory_option_id') ?? '')
      .toString()
      .trim(),
    workflow_type_id: (formData.get('workflow_type_id') ?? '')
      .toString()
      .trim(),
    start_date: (formData.get('start_date') ?? '').toString().trim(),
    end_date: (formData.get('end_date') ?? '').toString().trim(),
  }

  const missingFields = (
    Object.entries(requiredValues) as Array<[BookingFieldName, string]>
  )
    .filter(([, value]) => value.length === 0)
    .map(([field]) => field)

  const gpuCount = Number.parseInt(requiredValues.gpu_count, 10)
  if (!Number.isInteger(gpuCount) || gpuCount <= 0) {
    missingFields.push('gpu_count')
  }

  if (missingFields.length > 0) {
    return {
      payload: null,
      fieldErrors: buildRequiredFieldErrors(Array.from(new Set(missingFields))),
    }
  }

  return {
    payload: {
      gpu_type_id: Number.parseInt(requiredValues.gpu_type_id, 10),
      gpu_count: gpuCount,
      gram_option_id: Number.parseInt(requiredValues.gram_option_id, 10),
      memory_option_id: Number.parseInt(requiredValues.memory_option_id, 10),
      workflow_type_id: Number.parseInt(requiredValues.workflow_type_id, 10),
      start_date: requiredValues.start_date,
      end_date: requiredValues.end_date,
      alt_email: parseOptionalString(formData, 'alt_email'),
      project_name: parseOptionalString(formData, 'project_name'),
      project_pi: parseOptionalString(formData, 'project_pi'),
      project_grant_number: parseOptionalString(
        formData,
        'project_grant_number'
      ),
      technical_lead: parseOptionalString(formData, 'technical_lead'),
      event_start_date: parseOptionalString(formData, 'event_start_date'),
      event_end_date: parseOptionalString(formData, 'event_end_date'),
    },
    fieldErrors: {},
  }
}

function buildAuthHeaders(devUserEmail?: string): HeadersInit | undefined {
  if (!devUserEmail) {
    return undefined
  }
  return { 'X-Dev-User': devUserEmail }
}

function parseWorkflowTypeError(error: unknown): string {
  if (error instanceof Error) {
    if ('body' in error) {
      const body = (error as { body?: unknown }).body
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        const detail = (body as { detail?: unknown }).detail
        if (typeof detail === 'string' && detail.length > 0) {
          return detail
        }
      }
    }

    return error.message
  }

  return 'Unexpected error'
}

function safeRevalidate(path: string): void {
  try {
    revalidatePath(path)
  } catch {
    return
  }
}

function buildOptionFormState<T>(
  items: T[],
  status: OptionFormState<T>['status'],
  message: string | null,
  error: string | null
): OptionFormState<T> {
  return {
    status,
    message,
    error,
    items,
  }
}

export async function getGpuTypes(): Promise<GpuType[]> {
  return backendJson('/api/v1/gpu-types', gpuTypeListSchema)
}

export async function getWorkflowTypes(): Promise<WorkflowType[]> {
  return backendJson('/api/v1/workflow-types', workflowTypeListSchema)
}

export async function getCapacity(
  startDate: string,
  endDate: string,
  gpuTypeId?: number
): Promise<DailyCapacity[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  })

  if (gpuTypeId !== undefined) {
    params.set('gpu_type_id', String(gpuTypeId))
  }

  return backendJson(
    `/api/v1/capacity?${params.toString()}`,
    dailyCapacityListSchema
  )
}

export async function getBookings(
  startDate?: string,
  endDate?: string,
  gpuTypeId?: number,
  status?: string
): Promise<BookingResponse[]> {
  const params = new URLSearchParams()

  if (startDate) {
    params.set('start_date', startDate)
  }
  if (endDate) {
    params.set('end_date', endDate)
  }
  if (gpuTypeId !== undefined) {
    params.set('gpu_type_id', String(gpuTypeId))
  }
  if (status) {
    params.set('status', status)
  }

  const query = params.toString()
  const path = query ? `/api/v1/bookings?${query}` : '/api/v1/bookings'
  return backendJson(path, bookingListSchema)
}

export async function cancelBooking(bookingId: number): Promise<{
  success: boolean
  message: string
  booking: BookingResponse | null
}> {
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return {
      success: false,
      message: 'Invalid booking id.',
      booking: null,
    }
  }

  try {
    const booking = await backendJson(
      `/api/v1/bookings/${bookingId}`,
      bookingResponseSchema,
      {
        method: 'DELETE',
      }
    )
    safeRevalidate('/bookings')
    return {
      success: true,
      message: 'Booking cancelled successfully.',
      booking,
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Failed to cancel booking.',
      booking: null,
    }
  }
}

export async function validateBooking(
  formData: FormData
): Promise<BookingValidation> {
  const parsed = parseBookingPayload(formData)

  if (!parsed.payload) {
    throw new Error(
      'Required booking fields must be provided before validation.'
    )
  }

  return backendJson('/api/v1/capacity/validate', bookingValidationSchema, {
    method: 'POST',
    body: JSON.stringify(parsed.payload),
  })
}

export async function createBooking(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const parsed = parseBookingPayload(formData)

  if (!parsed.payload) {
    return {
      status: 'error',
      message: null,
      error: 'Please complete all required fields.',
      fieldErrors: parsed.fieldErrors,
    }
  }

  try {
    await backendJson('/api/v1/bookings', bookingResponseSchema, {
      method: 'POST',
      body: JSON.stringify(parsed.payload),
    })
    safeRevalidate('/bookings')
    return {
      status: 'success',
      message: 'Booking created successfully.',
      error: null,
      fieldErrors: {},
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error:
        error instanceof Error ? error.message : 'Failed to create booking.',
      fieldErrors: {},
    }
  }
}

export async function getGramOptions(
  devUserEmail?: string
): Promise<GramOption[]> {
  return backendJson('/api/v1/gram-options', gramOptionListSchema, {
    headers: buildAuthHeaders(devUserEmail),
  })
}

export async function getMemoryOptions(
  devUserEmail?: string
): Promise<MemoryOption[]> {
  return backendJson('/api/v1/memory-options', memoryOptionListSchema, {
    headers: buildAuthHeaders(devUserEmail),
  })
}

export async function createGpuType(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = (formData.get('name') ?? '').toString().trim()
  const gramGb = parsePositiveInteger(formData, 'gram_gb')
  const systemMemoryGb = parsePositiveInteger(formData, 'system_memory_gb')
  const totalCount = parsePositiveInteger(formData, 'total_count')

  if (
    !name ||
    gramGb === null ||
    systemMemoryGb === null ||
    totalCount === null
  ) {
    return {
      status: 'error',
      message: null,
      error: 'Name and numeric fields must be provided as positive integers.',
      gpuType: null,
    }
  }

  try {
    const gpuType = await backendJson(
      '/api/v1/admin/gpu-types',
      gpuTypeSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          gram_gb: gramGb,
          system_memory_gb: systemMemoryGb,
          total_count: totalCount,
        }),
      }
    )
    return {
      status: 'success',
      message: `Created GPU type ${gpuType.name}.`,
      error: null,
      gpuType,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error:
        error instanceof Error ? error.message : 'Failed to create GPU type.',
      gpuType: null,
    }
  }
}

export async function updateGpuType(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = Number(formData.get('id'))
  const name = (formData.get('name') ?? '').toString().trim()
  const gramGb = parsePositiveInteger(formData, 'gram_gb')
  const systemMemoryGb = parsePositiveInteger(formData, 'system_memory_gb')
  const totalCount = parsePositiveInteger(formData, 'total_count')

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !name ||
    gramGb === null ||
    systemMemoryGb === null ||
    totalCount === null
  ) {
    return {
      status: 'error',
      message: null,
      error: 'All fields are required and must be valid.',
      gpuType: null,
    }
  }

  try {
    const gpuType = await backendJson(
      `/api/v1/admin/gpu-types/${id}`,
      gpuTypeSchema,
      {
        method: 'PUT',
        body: JSON.stringify({
          name,
          gram_gb: gramGb,
          system_memory_gb: systemMemoryGb,
          total_count: totalCount,
        }),
      }
    )
    return {
      status: 'success',
      message: `Updated GPU type ${gpuType.name}.`,
      error: null,
      gpuType,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error:
        error instanceof Error ? error.message : 'Failed to update GPU type.',
      gpuType: null,
    }
  }
}

export async function createWorkflowType(
  _prev: WorkflowTypeFormState,
  formData: FormData
): Promise<WorkflowTypeFormState> {
  const name = (formData.get('name') ?? '').toString().trim()

  if (!name) {
    return {
      status: 'error',
      message: null,
      error: 'Name is required.',
      workflowType: null,
      deletedId: null,
    }
  }

  try {
    const workflowType = await backendJson(
      '/api/v1/admin/workflow-types',
      workflowTypeSchema,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    )
    safeRevalidate('/admin/workflow-types')
    return {
      status: 'success',
      message: `Created workflow type ${workflowType.name}.`,
      error: null,
      workflowType,
      deletedId: null,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: parseWorkflowTypeError(error),
      workflowType: null,
      deletedId: null,
    }
  }
}

export async function updateWorkflowType(
  _prev: WorkflowTypeFormState,
  formData: FormData
): Promise<WorkflowTypeFormState> {
  const id = Number(formData.get('id'))
  const name = (formData.get('name') ?? '').toString().trim()

  if (!Number.isInteger(id) || id <= 0 || !name) {
    return {
      status: 'error',
      message: null,
      error: 'Valid id and name are required.',
      workflowType: null,
      deletedId: null,
    }
  }

  try {
    const workflowType = await backendJson(
      `/api/v1/admin/workflow-types/${id}`,
      workflowTypeSchema,
      {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }
    )
    safeRevalidate('/admin/workflow-types')
    return {
      status: 'success',
      message: `Updated workflow type ${workflowType.name}.`,
      error: null,
      workflowType,
      deletedId: null,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: parseWorkflowTypeError(error),
      workflowType: null,
      deletedId: null,
    }
  }
}

export async function deleteWorkflowType(
  _prev: WorkflowTypeFormState,
  formData: FormData
): Promise<WorkflowTypeFormState> {
  const id = Number(formData.get('id'))

  if (!Number.isInteger(id) || id <= 0) {
    return {
      status: 'error',
      message: null,
      error: 'Valid id is required.',
      workflowType: null,
      deletedId: null,
    }
  }

  try {
    await backendJson(`/api/v1/admin/workflow-types/${id}`, z.any(), {
      method: 'DELETE',
    })
    safeRevalidate('/admin/workflow-types')
    return {
      status: 'success',
      message: 'Deleted workflow type.',
      error: null,
      workflowType: null,
      deletedId: id,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: parseWorkflowTypeError(error),
      workflowType: null,
      deletedId: null,
    }
  }
}

export async function mutateGramOptions(
  _prev: OptionFormState<GramOption>,
  formData: FormData
): Promise<OptionFormState<GramOption>> {
  const devUserEmail = getDevUserFromFormData(formData)
  const headers = buildAuthHeaders(devUserEmail)

  try {
    const intent = parseRequiredString(formData, 'intent')
    if (intent === 'add') {
      await backendJson('/api/v1/admin/gram-options', gramOptionSchema, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: parseRequiredString(formData, 'label'),
          value_gb: parseRequiredInteger(formData, 'value_gb'),
          sort_order: parseRequiredInteger(formData, 'sort_order'),
        }),
      })
    } else if (intent === 'edit') {
      const id = parseRequiredInteger(formData, 'id')
      await backendJson(`/api/v1/admin/gram-options/${id}`, gramOptionSchema, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          label: parseRequiredString(formData, 'label'),
          value_gb: parseRequiredInteger(formData, 'value_gb'),
          sort_order: parseRequiredInteger(formData, 'sort_order'),
        }),
      })
    } else if (intent === 'delete') {
      const id = parseRequiredInteger(formData, 'id')
      await backendJson(`/api/v1/admin/gram-options/${id}`, z.any(), {
        method: 'DELETE',
        headers,
      })
    } else {
      throw new Error(`Unsupported intent: ${intent}`)
    }

    const items = await getGramOptions(devUserEmail)
    safeRevalidate('/admin/memory-options')
    return buildOptionFormState(items, 'success', 'GRAM options updated.', null)
  } catch (error) {
    const items = await getGramOptions(devUserEmail)
    return buildOptionFormState(
      items,
      'error',
      null,
      error instanceof Error ? error.message : 'Failed to update GRAM options.'
    )
  }
}

export async function mutateMemoryOptions(
  _prev: OptionFormState<MemoryOption>,
  formData: FormData
): Promise<OptionFormState<MemoryOption>> {
  const devUserEmail = getDevUserFromFormData(formData)
  const headers = buildAuthHeaders(devUserEmail)

  try {
    const intent = parseRequiredString(formData, 'intent')
    if (intent === 'add') {
      await backendJson('/api/v1/admin/memory-options', memoryOptionSchema, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: parseRequiredString(formData, 'label'),
          value_gb: parseRequiredInteger(formData, 'value_gb'),
          sort_order: parseRequiredInteger(formData, 'sort_order'),
        }),
      })
    } else if (intent === 'edit') {
      const id = parseRequiredInteger(formData, 'id')
      await backendJson(
        `/api/v1/admin/memory-options/${id}`,
        memoryOptionSchema,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            label: parseRequiredString(formData, 'label'),
            value_gb: parseRequiredInteger(formData, 'value_gb'),
            sort_order: parseRequiredInteger(formData, 'sort_order'),
          }),
        }
      )
    } else if (intent === 'delete') {
      const id = parseRequiredInteger(formData, 'id')
      await backendJson(`/api/v1/admin/memory-options/${id}`, z.any(), {
        method: 'DELETE',
        headers,
      })
    } else {
      throw new Error(`Unsupported intent: ${intent}`)
    }

    const items = await getMemoryOptions(devUserEmail)
    safeRevalidate('/admin/memory-options')
    return buildOptionFormState(
      items,
      'success',
      'System memory options updated.',
      null
    )
  } catch (error) {
    const items = await getMemoryOptions(devUserEmail)
    return buildOptionFormState(
      items,
      'error',
      null,
      error instanceof Error
        ? error.message
        : 'Failed to update memory options.'
    )
  }
}

export async function requestGreeting(
  _prevState: GreetingState,
  formData: FormData
): Promise<GreetingState> {
  const name = (formData.get('name') ?? 'World').toString() || 'World'

  try {
    const response = await backendJson(
      `/api/v1/hello?name=${encodeURIComponent(name)}`,
      messageResponseSchema
    )
    return {
      status: 'success',
      message: response.message,
      error: null,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function fetchInitialGreeting() {
  return backendJson('/api/v1/hello', messageResponseSchema)
}

export async function fetchHealth() {
  return backendJson('/api/v1/health', healthResponseSchema)
}

export async function getCurrentUser(devUserEmail?: string): Promise<UserInfo> {
  const headers = devUserEmail ? { 'X-Dev-User': devUserEmail } : undefined
  return backendJson('/api/v1/auth/me', userInfoSchema, { headers })
}
