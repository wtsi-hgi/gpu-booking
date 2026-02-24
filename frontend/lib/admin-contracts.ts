import { z } from 'zod'

export const gpuTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  gram_gb: z.number(),
  system_memory_gb: z.number(),
  total_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type GpuType = z.infer<typeof gpuTypeSchema>

export const gpuTypeListSchema = z.array(gpuTypeSchema)

export const workflowTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export type WorkflowType = z.infer<typeof workflowTypeSchema>

export const workflowTypeListSchema = z.array(workflowTypeSchema)

export const gramOptionSchema = z.object({
  id: z.number(),
  label: z.string(),
  value_gb: z.number(),
  sort_order: z.number(),
})

export type GramOption = z.infer<typeof gramOptionSchema>

export const gramOptionListSchema = z.array(gramOptionSchema)

export const memoryOptionSchema = z.object({
  id: z.number(),
  label: z.string(),
  value_gb: z.number(),
  sort_order: z.number(),
})

export type MemoryOption = z.infer<typeof memoryOptionSchema>

export const memoryOptionListSchema = z.array(memoryOptionSchema)
