import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGpuType, initialFormState, updateGpuType } from '@/app/actions'
import { upsertGpuType } from '@/components/gpu-type-manager'
import { backendJson } from '@/lib/backend-client'

vi.mock('@/lib/backend-client', () => ({
  backendJson: vi.fn(),
}))

const seededGpuTypes = [
  {
    id: 1,
    name: 'H200',
    gram_gb: 141,
    system_memory_gb: 512,
    total_count: 8,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 2,
    name: 'H100',
    gram_gb: 80,
    system_memory_gb: 500,
    total_count: 16,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 3,
    name: 'A100',
    gram_gb: 40,
    system_memory_gb: 256,
    total_count: 32,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 4,
    name: 'V100',
    gram_gb: 16,
    system_memory_gb: 128,
    total_count: 24,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
]

describe('gpu type admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds a new GPU type and updates table state with L40', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    const createdGpuType = {
      id: 5,
      name: 'L40',
      gram_gb: 48,
      system_memory_gb: 256,
      total_count: 8,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    }
    backendJsonMock.mockResolvedValueOnce(createdGpuType)

    const formData = new FormData()
    formData.set('name', 'L40')
    formData.set('gram_gb', '48')
    formData.set('system_memory_gb', '256')
    formData.set('total_count', '8')

    const result = await createGpuType(initialFormState, formData)
    const updatedList = upsertGpuType(seededGpuTypes, createdGpuType)

    expect(result.status).toBe('success')
    expect(result.gpuType?.name).toBe('L40')
    expect(updatedList).toHaveLength(5)
    expect(updatedList.some((item) => item.name === 'L40')).toBe(true)
  })

  it('edits H100 total count to 50 and updates table state', async () => {
    const backendJsonMock = vi.mocked(backendJson)
    const updatedGpuType = {
      id: 2,
      name: 'H100',
      gram_gb: 80,
      system_memory_gb: 500,
      total_count: 50,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }
    backendJsonMock.mockResolvedValueOnce(updatedGpuType)

    const formData = new FormData()
    formData.set('id', '2')
    formData.set('name', 'H100')
    formData.set('gram_gb', '80')
    formData.set('system_memory_gb', '500')
    formData.set('total_count', '50')

    const result = await updateGpuType(initialFormState, formData)
    const updatedList = upsertGpuType(seededGpuTypes, updatedGpuType)
    const h100 = updatedList.find((item) => item.name === 'H100')

    expect(result.status).toBe('success')
    expect(h100?.total_count).toBe(50)
  })
})
