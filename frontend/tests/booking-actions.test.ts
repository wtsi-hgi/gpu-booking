import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBooking,
  getBookings,
  getCapacity,
  validateBooking,
} from '@/app/actions'
import { backendJson } from '@/lib/backend-client'
import {
  bookingListSchema,
  bookingResponseSchema,
  bookingValidationSchema,
  dailyCapacityListSchema,
} from '@/lib/booking-contracts'

vi.mock('@/lib/backend-client', () => ({
  backendJson: vi.fn(),
}))

describe('booking data actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds getCapacity query params with gpu_type_id and uses capacity schema', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce([])

    const result = await getCapacity('2026-03-01', '2026-03-31', 2)

    expect(result).toEqual([])
    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/capacity?start_date=2026-03-01&end_date=2026-03-31&gpu_type_id=2',
      dailyCapacityListSchema
    )
  })

  it('builds getCapacity query params without gpu_type_id when omitted', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce([])

    await getCapacity('2026-04-01', '2026-04-30')

    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/capacity?start_date=2026-04-01&end_date=2026-04-30',
      dailyCapacityListSchema
    )
  })

  it('builds getBookings query params for all provided filters and uses booking schema', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce([])

    const result = await getBookings('2026-05-01', '2026-05-31', 3, 'pending')

    expect(result).toEqual([])
    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/bookings?start_date=2026-05-01&end_date=2026-05-31&gpu_type_id=3&status=pending',
      bookingListSchema
    )
  })

  it('uses bare bookings endpoint when no filters are provided', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce([])

    await getBookings()

    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/bookings',
      bookingListSchema
    )
  })

  it('posts required and optional fields in createBooking', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce({
      id: 1,
      user_email: 'user@example.com',
      gpu_type_id: 1,
      gpu_type_name: 'H100',
      gpu_count: 2,
      gram_option_id: 1,
      gram_label: '80GB',
      memory_option_id: 1,
      memory_label: '500GB',
      workflow_type_id: 1,
      workflow_type_name: 'Training',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
      status: 'unconfirmed',
      alt_email: 'alt@example.com',
      project_name: 'Genome Atlas',
      project_pi: 'Dr Test',
      project_grant_number: 'GR-12345',
      technical_lead: 'Lead Engineer',
      event_start_date: '2026-04-09',
      event_end_date: '2026-04-13',
      admin_notes: null,
      admin_modified_by: null,
      admin_modified_at: null,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      warnings: [],
    })

    const formData = new FormData()
    formData.set('gpu_type_id', '1')
    formData.set('gpu_count', '2')
    formData.set('gram_option_id', '1')
    formData.set('memory_option_id', '1')
    formData.set('workflow_type_id', '1')
    formData.set('start_date', '2026-04-10')
    formData.set('end_date', '2026-04-12')
    formData.set('alt_email', 'alt@example.com')
    formData.set('project_name', 'Genome Atlas')
    formData.set('project_pi', 'Dr Test')
    formData.set('project_grant_number', 'GR-12345')
    formData.set('technical_lead', 'Lead Engineer')
    formData.set('event_start_date', '2026-04-09')
    formData.set('event_end_date', '2026-04-13')

    const state = await createBooking(
      { status: 'idle', message: null, error: null, fieldErrors: {} },
      formData
    )

    expect(state.status).toBe('success')
    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/bookings',
      bookingResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          gpu_type_id: 1,
          gpu_count: 2,
          gram_option_id: 1,
          memory_option_id: 1,
          workflow_type_id: 1,
          start_date: '2026-04-10',
          end_date: '2026-04-12',
          alt_email: 'alt@example.com',
          project_name: 'Genome Atlas',
          project_pi: 'Dr Test',
          project_grant_number: 'GR-12345',
          technical_lead: 'Lead Engineer',
          event_start_date: '2026-04-09',
          event_end_date: '2026-04-13',
        }),
      }
    )
  })

  it('calls validation endpoint for validateBooking', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    backendJsonMock.mockResolvedValueOnce({
      valid: false,
      warnings: [
        {
          rule: 'duration_gt_14_days',
          message: 'Booking duration exceeds 14 days.',
          severity: 'warning',
        },
      ],
      blocked: false,
      block_reason: null,
    })

    const formData = new FormData()
    formData.set('gpu_type_id', '1')
    formData.set('gpu_count', '2')
    formData.set('gram_option_id', '1')
    formData.set('memory_option_id', '1')
    formData.set('workflow_type_id', '1')
    formData.set('start_date', '2026-04-10')
    formData.set('end_date', '2026-04-12')

    await validateBooking(formData)

    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/capacity/validate',
      bookingValidationSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          gpu_type_id: 1,
          gpu_count: 2,
          gram_option_id: 1,
          memory_option_id: 1,
          workflow_type_id: 1,
          start_date: '2026-04-10',
          end_date: '2026-04-12',
          alt_email: null,
          project_name: null,
          project_pi: null,
          project_grant_number: null,
          technical_lead: null,
          event_start_date: null,
          event_end_date: null,
        }),
      }
    )
  })
})
