import { z } from 'zod'

export const bookingStatusSchema = z.enum([
  'unconfirmed',
  'confirmed',
  'tentative',
  'spot',
  'rejected',
  'cancelled',
])

export const bookingResponseSchema = z.object({
  id: z.number(),
  user_email: z.string(),
  gpu_host_type_id: z.number(),
  gpu_type: z.string(),
  gpu_count: z.number(),
  host_count: z.number(),
  workflow_type_id: z.number(),
  workflow_type_name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  status: bookingStatusSchema,
  alt_email: z.string().nullable(),
  project_name: z.string().nullable(),
  project_pi: z.string().nullable(),
  project_grant_number: z.string().nullable(),
  technical_lead: z.string().nullable(),
  event_start_date: z.string().nullable(),
  event_end_date: z.string().nullable(),
  admin_notes: z.string().nullable(),
  admin_modified_by: z.string().nullable(),
  admin_modified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  warnings: z.array(z.string()),
})

export type BookingResponse = z.infer<typeof bookingResponseSchema>

export const bookingListSchema = z.array(bookingResponseSchema)

export const dailyCapacitySchema = z.object({
  date: z.string(),
  gpu_host_type_id: z.number(),
  gpu_type: z.string(),
  gpu_count: z.number(),
  total: z.number(),
  confirmed_used: z.number(),
  pending_used: z.number(),
  available: z.number(),
  user_used: z.number(),
  user_percent: z.number(),
  warnings: z.array(z.string()),
})

export type DailyCapacity = z.infer<typeof dailyCapacitySchema>

export const dailyCapacityListSchema = z.array(dailyCapacitySchema)

export const hostTypeAvailabilitySchema = z.object({
  gpu_host_type_id: z.number(),
  gpu_type: z.string(),
  gpu_count: z.number(),
  total: z.number(),
  currently_bookable: z.number(),
})

export type HostTypeAvailability = z.infer<typeof hostTypeAvailabilitySchema>

export const hostTypeAvailabilityListSchema = z.array(
  hostTypeAvailabilitySchema
)

export const capacityWarningSchema = z.object({
  rule: z.string(),
  message: z.string(),
  severity: z.enum(['warning', 'block']),
})

export const bookingValidationSchema = z.object({
  valid: z.boolean(),
  warnings: z.array(capacityWarningSchema),
  blocked: z.boolean(),
  block_reason: z.string().nullable(),
})

export type BookingValidation = z.infer<typeof bookingValidationSchema>
