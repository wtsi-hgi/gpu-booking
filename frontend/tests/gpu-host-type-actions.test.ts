import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGpuHostType, updateGpuHostType } from '@/app/actions'
import { upsertGpuHostType } from '@/components/gpu-host-type-manager'
import { backendJson } from '@/lib/backend-client'
import { initialFormState } from '@/lib/action-form-states'

vi.mock('@/lib/backend-client', () => ({
  backendJson: vi.fn(),
}))

const seededGpuHostTypes = [
  {
    id: 1,
    gpu_type: 'H200',
    gpu_count: 8,
    total_count: 3,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 2,
    gpu_type: 'H100',
    gpu_count: 8,
    total_count: 2,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
]

describe('GPU host type admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds a new GPU host type and updates table state', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    const createdGpuHostType = {
      id: 3,
      gpu_type: 'L40S',
      gpu_count: 4,
      total_count: 6,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    }
    backendJsonMock.mockResolvedValueOnce(createdGpuHostType)

    const formData = new FormData()
    formData.set('gpu_type', 'L40S')
    formData.set('gpu_count', '4')
    formData.set('total_count', '6')

    const result = await createGpuHostType(initialFormState, formData)
    const updatedList = upsertGpuHostType(
      seededGpuHostTypes,
      createdGpuHostType
    )

    expect(result.status).toBe('success')
    expect(result.gpuHostType?.gpu_type).toBe('L40S')
    expect(updatedList).toHaveLength(3)
    expect(updatedList.some((item) => item.gpu_type === 'L40S')).toBe(true)
    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/admin/gpu-host-types',
      expect.any(Object),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          gpu_type: 'L40S',
          gpu_count: 4,
          total_count: 6,
        }),
      })
    )
  })

  it('edits available host count and updates table state', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    const updatedGpuHostType = {
      id: 2,
      gpu_type: 'H100',
      gpu_count: 8,
      total_count: 5,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }
    backendJsonMock.mockResolvedValueOnce(updatedGpuHostType)

    const formData = new FormData()
    formData.set('id', '2')
    formData.set('gpu_type', 'H100')
    formData.set('gpu_count', '8')
    formData.set('total_count', '5')

    const result = await updateGpuHostType(initialFormState, formData)
    const updatedList = upsertGpuHostType(
      seededGpuHostTypes,
      updatedGpuHostType
    )
    const h100 = updatedList.find((item) => item.gpu_type === 'H100')

    expect(result.status).toBe('success')
    expect(h100?.total_count).toBe(5)
    expect(backendJsonMock).toHaveBeenCalledWith(
      '/api/v1/admin/gpu-host-types/2',
      expect.any(Object),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          gpu_type: 'H100',
          gpu_count: 8,
          total_count: 5,
        }),
      })
    )
  })
})
