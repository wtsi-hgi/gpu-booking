import { describe, expect, it } from 'vitest'

import {
  gpuTypeListSchema,
  gpuTypeSchema,
  gramOptionSchema,
  memoryOptionSchema,
  workflowTypeSchema,
} from '@/lib/admin-contracts'

describe('admin contracts', () => {
  it('parses a valid GPU type payload', () => {
    const payload = {
      id: 1,
      name: 'H100',
      gram_gb: 80,
      system_memory_gb: 500,
      total_count: 16,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }

    expect(gpuTypeSchema.parse(payload)).toEqual(payload)
  })

  it('rejects invalid GPU type payloads missing name', () => {
    const payload = {
      id: 1,
      gram_gb: 80,
      system_memory_gb: 500,
      total_count: 16,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-02T00:00:00',
    }

    expect(gpuTypeSchema.safeParse(payload).success).toBe(false)
  })

  it('parses GPU type list payloads', () => {
    const payload = [
      {
        id: 1,
        name: 'H100',
        gram_gb: 80,
        system_memory_gb: 500,
        total_count: 16,
        created_at: '2026-01-01T00:00:00',
        updated_at: '2026-01-02T00:00:00',
      },
    ]

    expect(gpuTypeListSchema.parse(payload)).toEqual(payload)
  })

  it('parses workflow type payloads', () => {
    const payload = { id: 1, name: 'Inference workloads' }
    expect(workflowTypeSchema.parse(payload)).toEqual(payload)
  })

  it('parses GRAM option payloads', () => {
    const payload = {
      id: 1,
      label: '80GB',
      value_gb: 80,
      sort_order: 1,
    }

    expect(gramOptionSchema.parse(payload)).toEqual(payload)
  })

  it('parses memory option payloads', () => {
    const payload = {
      id: 1,
      label: '500GB',
      value_gb: 500,
      sort_order: 1,
    }

    expect(memoryOptionSchema.parse(payload)).toEqual(payload)
  })
})
