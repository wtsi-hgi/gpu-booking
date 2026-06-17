import { describe, expect, it } from 'vitest'

import {
  formatGpuHostTypeLabel,
  gpuHostTypeListSchema,
  gpuHostTypeSchema,
  workflowTypeSchema,
} from '@/lib/admin-contracts'

describe('admin contracts', () => {
  it('parses a valid GPU host type payload', () => {
    const payload = {
      id: 1,
      gpu_type: 'H100',
      gpu_count: 8,
      total_count: 2,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }

    expect(gpuHostTypeSchema.parse(payload)).toEqual(payload)
  })

  it('rejects invalid GPU host type payloads missing gpu_count', () => {
    const payload = {
      id: 1,
      gpu_type: 'H100',
      total_count: 2,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }

    expect(gpuHostTypeSchema.safeParse(payload).success).toBe(false)
  })

  it('parses GPU host type list payloads', () => {
    const payload = [
      {
        id: 1,
        gpu_type: 'H100',
        gpu_count: 8,
        total_count: 2,
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-02T00:00:00',
      },
    ]

    expect(gpuHostTypeListSchema.parse(payload)).toEqual(payload)
  })

  it('formats the selectable GPU host type label from presentation data', () => {
    expect(formatGpuHostTypeLabel({ gpu_type: 'H100', gpu_count: 8 })).toBe(
      '8 GPU H100'
    )
  })

  it('parses workflow type payloads', () => {
    const payload = { id: 1, name: 'Inference workloads' }
    expect(workflowTypeSchema.parse(payload)).toEqual(payload)
  })
})
