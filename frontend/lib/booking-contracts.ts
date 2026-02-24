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
  gpu_type_id: z.number(),
  gpu_type_name: z.string(),
  gpu_count: z.number(),
  gram_option_id: z.number(),
  gram_label: z.string(),
  memory_option_id: z.number(),
  memory_label: z.string(),
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
