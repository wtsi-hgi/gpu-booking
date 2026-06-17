import { z } from 'zod'

export const gpuHostTypeSchema = z.object({
  id: z.number(),
  gpu_type: z.string(),
  gpu_count: z.number(),
  total_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type GpuHostType = z.infer<typeof gpuHostTypeSchema>

export const gpuHostTypeListSchema = z.array(gpuHostTypeSchema)

export function formatGpuHostTypeLabel(
  hostType: Pick<GpuHostType, 'gpu_type' | 'gpu_count'>
): string {
  return `${hostType.gpu_count} GPU ${hostType.gpu_type}`
}

export const workflowTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export type WorkflowType = z.infer<typeof workflowTypeSchema>

export const workflowTypeListSchema = z.array(workflowTypeSchema)
