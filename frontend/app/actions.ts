'use server'

import { revalidatePath } from 'next/cache'
import { z, type ZodSchema } from 'zod'

import { backendJson } from '@/lib/backend-client'
import {
  gpuHostTypeListSchema,
  gpuHostTypeSchema,
  workflowTypeListSchema,
  workflowTypeSchema,
  type GpuHostType,
  type WorkflowType,
} from '@/lib/admin-contracts'
import { userInfoSchema, type UserInfo } from '@/lib/auth-contracts'
import { healthResponseSchema, messageResponseSchema } from '@/lib/contracts'
import { type GreetingState } from '@/lib/greeting-state'
import { buildRequestInitWithAuth, fetchCurrentUser } from '@/lib/server-auth'
import {
  bookingListSchema,
  bookingResponseSchema,
  bookingValidationSchema,
  dailyCapacityListSchema,
  type BookingResponse,
  type BookingValidation,
  type DailyCapacity,
  hostTypeAvailabilityListSchema,
  type HostTypeAvailability,
} from '@/lib/booking-contracts'
import {
  buildRequiredFieldErrors,
  createInitialBookingFormValues,
  type BookingFieldName,
  type BookingFormState,
  type BookingFormValues,
} from '@/lib/booking-state'
import {
  type AdminBookingFormState,
  type FormState,
  type WorkflowTypeFormState,
} from '@/lib/action-form-states'

function parsePositiveInteger(formData: FormData, key: string): number | null {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

function parseNonNegativeInteger(
  formData: FormData,
  key: string
): number | null {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value < 0) {
    return null
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

function parseOptionalString(formData: FormData, key: string): string | null {
  const value = (formData.get(key) ?? '').toString().trim()
  return value.length > 0 ? value : null
}

function parseRequiredDateString(formData: FormData, key: string): string {
  const value = (formData.get(key) ?? '').toString().trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

function parseOptionalDateString(
  formData: FormData,
  key: string
): string | null {
  const value = (formData.get(key) ?? '').toString().trim()
  if (!value) {
    return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

function parseErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }

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

type ParsedBookingPayload = {
  payload: {
    gpu_host_type_id: number
    host_count: number
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
    gpu_host_type_id: (formData.get('gpu_host_type_id') ?? '')
      .toString()
      .trim(),
    host_count: (formData.get('host_count') ?? '').toString().trim(),
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

  const hostCount = Number.parseInt(requiredValues.host_count, 10)
  if (!Number.isInteger(hostCount) || hostCount <= 0) {
    missingFields.push('host_count')
  }

  if (missingFields.length > 0) {
    return {
      payload: null,
      fieldErrors: buildRequiredFieldErrors(Array.from(new Set(missingFields))),
    }
  }

  return {
    payload: {
      gpu_host_type_id: Number.parseInt(requiredValues.gpu_host_type_id, 10),
      host_count: hostCount,
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

function extractBookingFormValues(formData: FormData): BookingFormValues {
  return createInitialBookingFormValues({
    gpu_host_type_id: (formData.get('gpu_host_type_id') ?? '').toString(),
    host_count: (formData.get('host_count') ?? '').toString(),
    workflow_type_id: (formData.get('workflow_type_id') ?? '').toString(),
    alt_email: (formData.get('alt_email') ?? '').toString(),
    start_date: (formData.get('start_date') ?? '').toString(),
    end_date: (formData.get('end_date') ?? '').toString(),
    project_name: (formData.get('project_name') ?? '').toString(),
    project_pi: (formData.get('project_pi') ?? '').toString(),
    project_grant_number: (
      formData.get('project_grant_number') ?? ''
    ).toString(),
    technical_lead: (formData.get('technical_lead') ?? '').toString(),
    event_start_date: (formData.get('event_start_date') ?? '').toString(),
    event_end_date: (formData.get('event_end_date') ?? '').toString(),
  })
}

async function backendJsonWithAuth<T>(
  path: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
  devUserEmail?: string
): Promise<T> {
  const requestInit = await buildRequestInitWithAuth(init, devUserEmail)
  if (requestInit) {
    return backendJson(path, schema, requestInit)
  }

  if (init) {
    return backendJson(path, schema, init)
  }

  return backendJson(path, schema)
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

export async function getGpuHostTypes(): Promise<GpuHostType[]> {
  return backendJsonWithAuth('/api/v1/gpu-host-types', gpuHostTypeListSchema)
}

export async function getWorkflowTypes(): Promise<WorkflowType[]> {
  return backendJsonWithAuth('/api/v1/workflow-types', workflowTypeListSchema)
}

export async function getCapacity(
  startDate: string,
  endDate: string,
  gpuHostTypeId?: number
): Promise<DailyCapacity[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  })

  if (gpuHostTypeId !== undefined) {
    params.set('gpu_host_type_id', String(gpuHostTypeId))
  }

  return backendJsonWithAuth(
    `/api/v1/capacity?${params.toString()}`,
    dailyCapacityListSchema
  )
}

export async function getHostTypeAvailability(
  startDate: string,
  endDate: string
): Promise<HostTypeAvailability[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  })

  return backendJsonWithAuth(
    `/api/v1/capacity/host-types/availability?${params.toString()}`,
    hostTypeAvailabilityListSchema
  )
}

export async function getBookings(
  startDate?: string,
  endDate?: string,
  gpuHostTypeId?: number,
  status?: string
): Promise<BookingResponse[]> {
  const params = new URLSearchParams()

  if (startDate) {
    params.set('start_date', startDate)
  }
  if (endDate) {
    params.set('end_date', endDate)
  }
  if (gpuHostTypeId !== undefined) {
    params.set('gpu_host_type_id', String(gpuHostTypeId))
  }
  if (status) {
    params.set('status', status)
  }

  const query = params.toString()
  const path = query ? `/api/v1/bookings?${query}` : '/api/v1/bookings'
  return backendJsonWithAuth(path, bookingListSchema)
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
    const requestInit = await buildRequestInitWithAuth({
      method: 'DELETE',
    })
    const booking = await backendJson(
      `/api/v1/bookings/${bookingId}`,
      bookingResponseSchema,
      requestInit
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

export async function adminUpdateBooking(
  _prev: AdminBookingFormState,
  formData: FormData
): Promise<AdminBookingFormState> {
  const bookingId = Number.parseInt(
    (formData.get('booking_id') ?? '').toString(),
    10
  )
  const status = (formData.get('status') ?? '').toString().trim()

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return {
      status: 'error',
      message: null,
      error: 'Invalid booking id.',
      booking: null,
    }
  }

  const validStatuses = new Set([
    'unconfirmed',
    'confirmed',
    'tentative',
    'spot',
    'rejected',
    'cancelled',
  ])

  if (!validStatuses.has(status)) {
    return {
      status: 'error',
      message: null,
      error: 'Invalid status value.',
      booking: null,
    }
  }

  try {
    const payload = {
      status,
      admin_notes: parseOptionalString(formData, 'admin_notes'),
      gpu_host_type_id: parseRequiredInteger(formData, 'gpu_host_type_id'),
      host_count: parseRequiredInteger(formData, 'host_count'),
      workflow_type_id: parseRequiredInteger(formData, 'workflow_type_id'),
      start_date: parseRequiredDateString(formData, 'start_date'),
      end_date: parseRequiredDateString(formData, 'end_date'),
      alt_email: parseOptionalString(formData, 'alt_email'),
      project_name: parseOptionalString(formData, 'project_name'),
      project_pi: parseOptionalString(formData, 'project_pi'),
      project_grant_number: parseOptionalString(
        formData,
        'project_grant_number'
      ),
      technical_lead: parseOptionalString(formData, 'technical_lead'),
      event_start_date: parseOptionalDateString(formData, 'event_start_date'),
      event_end_date: parseOptionalDateString(formData, 'event_end_date'),
    }

    if (payload.host_count <= 0) {
      throw new Error('Invalid host_count')
    }

    const requestInit = await buildRequestInitWithAuth({
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    const booking = await backendJson(
      `/api/v1/admin/bookings/${bookingId}`,
      bookingResponseSchema,
      requestInit
    )

    safeRevalidate('/admin/bookings')
    safeRevalidate('/bookings')

    return {
      status: 'success',
      message: 'Booking updated successfully.',
      error: null,
      booking,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: parseErrorMessage(error, 'Failed to update booking.'),
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

  return backendJsonWithAuth(
    '/api/v1/capacity/validate',
    bookingValidationSchema,
    {
      method: 'POST',
      body: JSON.stringify(parsed.payload),
    }
  )
}

export async function createBooking(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const values = extractBookingFormValues(formData)
  const parsed = parseBookingPayload(formData)

  if (!parsed.payload) {
    return {
      status: 'error',
      message: null,
      error: 'Please complete all required fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    }
  }

  try {
    await backendJsonWithAuth('/api/v1/bookings', bookingResponseSchema, {
      method: 'POST',
      body: JSON.stringify(parsed.payload),
    })
    safeRevalidate('/bookings')
    return {
      status: 'success',
      message: 'Booking created successfully.',
      error: null,
      fieldErrors: {},
      values,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error: parseErrorMessage(error, 'Failed to create booking.'),
      fieldErrors: {},
      values,
    }
  }
}

export async function createGpuHostType(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const gpuType = (formData.get('gpu_type') ?? '').toString().trim()
  const gpuCount = parsePositiveInteger(formData, 'gpu_count')
  const totalCount = parseNonNegativeInteger(formData, 'total_count')

  if (!gpuType || gpuCount === null || totalCount === null) {
    return {
      status: 'error',
      message: null,
      error: 'GPU type and numeric fields must be valid.',
      gpuHostType: null,
    }
  }

  try {
    const requestInit = await buildRequestInitWithAuth({
      method: 'POST',
      body: JSON.stringify({
        gpu_type: gpuType,
        gpu_count: gpuCount,
        total_count: totalCount,
      }),
    })

    const gpuHostType = await backendJson(
      '/api/v1/admin/gpu-host-types',
      gpuHostTypeSchema,
      requestInit
    )
    return {
      status: 'success',
      message: `Created GPU host type ${gpuHostType.gpu_type}.`,
      error: null,
      gpuHostType,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create GPU host type.',
      gpuHostType: null,
    }
  }
}

export async function updateGpuHostType(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = Number(formData.get('id'))
  const gpuType = (formData.get('gpu_type') ?? '').toString().trim()
  const gpuCount = parsePositiveInteger(formData, 'gpu_count')
  const totalCount = parseNonNegativeInteger(formData, 'total_count')

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !gpuType ||
    gpuCount === null ||
    totalCount === null
  ) {
    return {
      status: 'error',
      message: null,
      error: 'All fields are required and must be valid.',
      gpuHostType: null,
    }
  }

  try {
    const requestInit = await buildRequestInitWithAuth({
      method: 'PUT',
      body: JSON.stringify({
        gpu_type: gpuType,
        gpu_count: gpuCount,
        total_count: totalCount,
      }),
    })

    const gpuHostType = await backendJson(
      `/api/v1/admin/gpu-host-types/${id}`,
      gpuHostTypeSchema,
      requestInit
    )
    return {
      status: 'success',
      message: `Updated GPU host type ${gpuHostType.gpu_type}.`,
      error: null,
      gpuHostType,
    }
  } catch (error) {
    return {
      status: 'error',
      message: null,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update GPU host type.',
      gpuHostType: null,
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
    const requestInit = await buildRequestInitWithAuth({
      method: 'POST',
      body: JSON.stringify({ name }),
    })

    const workflowType = await backendJson(
      '/api/v1/admin/workflow-types',
      workflowTypeSchema,
      requestInit
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
    const requestInit = await buildRequestInitWithAuth({
      method: 'PUT',
      body: JSON.stringify({ name }),
    })

    const workflowType = await backendJson(
      `/api/v1/admin/workflow-types/${id}`,
      workflowTypeSchema,
      requestInit
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
    await backendJson(
      `/api/v1/admin/workflow-types/${id}`,
      z.any(),
      await buildRequestInitWithAuth({
        method: 'DELETE',
      })
    )
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
  return fetchCurrentUser(devUserEmail)
}
