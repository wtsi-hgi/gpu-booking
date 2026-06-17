import { describe, expect, it } from 'vitest'

import {
  bookingListSchema,
  bookingResponseSchema,
  bookingValidationSchema,
  capacityWarningSchema,
  dailyCapacitySchema,
} from '@/lib/booking-contracts'

const fullBookingPayload = {
  id: 1,
  user_email: 'user@example.com',
  gpu_host_type_id: 1,
  gpu_type: 'H100',
  gpu_count: 8,
  host_count: 2,
  workflow_type_id: 1,
  workflow_type_name: 'Inference workloads',
  start_date: '2026-03-01',
  end_date: '2026-03-05',
  status: 'confirmed',
  alt_email: null,
  project_name: null,
  project_pi: null,
  project_grant_number: null,
  technical_lead: null,
  event_start_date: null,
  event_end_date: null,
  admin_notes: null,
  admin_modified_by: null,
  admin_modified_at: null,
  created_at: '2026-02-01T00:00:00',
  updated_at: '2026-02-02T00:00:00',
  warnings: [],
}

describe('booking contracts', () => {
  it('parses valid booking response payloads', () => {
    expect(bookingResponseSchema.parse(fullBookingPayload)).toEqual(
      fullBookingPayload
    )
  })

  it('rejects invalid booking status values', () => {
    const payload = { ...fullBookingPayload, status: 'invalid_status' }
    expect(bookingResponseSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects payloads missing required host_count', () => {
    const { host_count, ...payload } = fullBookingPayload
    expect(host_count).toBe(2)
    expect(bookingResponseSchema.safeParse(payload).success).toBe(false)
  })

  it('accepts nullable fields set to null', () => {
    const payload = {
      ...fullBookingPayload,
      alt_email: null,
      project_name: null,
      project_pi: null,
      project_grant_number: null,
      technical_lead: null,
      event_start_date: null,
      event_end_date: null,
      admin_notes: null,
      admin_modified_by: null,
      admin_modified_at: null,
    }

    expect(bookingResponseSchema.parse(payload)).toEqual(payload)
  })

  it('parses valid booking lists', () => {
    const payload = [fullBookingPayload]
    expect(bookingListSchema.parse(payload)).toEqual(payload)
  })

  it('accepts empty booking lists', () => {
    expect(bookingListSchema.parse([])).toEqual([])
  })

  it('parses valid daily capacity payloads', () => {
    const payload = {
      date: '2026-03-01',
      gpu_host_type_id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      total: 5,
      confirmed_used: 1,
      pending_used: 2,
      available: 4,
      user_used: 3,
      user_percent: 15,
      warnings: [],
    }

    expect(dailyCapacitySchema.parse(payload)).toEqual(payload)
  })

  it('rejects daily capacity payloads missing total', () => {
    const payload = {
      date: '2026-03-01',
      gpu_host_type_id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      confirmed_used: 1,
      pending_used: 2,
      available: 4,
      user_used: 3,
      user_percent: 15,
      warnings: [],
    }

    expect(dailyCapacitySchema.safeParse(payload).success).toBe(false)
  })

  it('parses valid booking validation payloads', () => {
    const payload = {
      valid: true,
      warnings: [
        {
          rule: 'capacity_soft_limit',
          message: 'Requested hosts exceed soft capacity threshold.',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    }

    expect(bookingValidationSchema.parse(payload)).toEqual(payload)
  })

  it("parses capacity warning payloads with severity 'warning'", () => {
    const payload = {
      rule: 'capacity_soft_limit',
      message: 'Requested hosts exceed soft capacity threshold.',
      severity: 'warning',
    }

    expect(capacityWarningSchema.parse(payload)).toEqual(payload)
  })
})
