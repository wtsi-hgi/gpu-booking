export function getWorkflowGpuWarning(
  gpuType: string | undefined,
  workflowName: string | undefined,
  designatedGpuTypes: string[]
): string | null {
  if (
    !gpuType ||
    !workflowName ||
    !/\b(inference|interactive)\b/i.test(workflowName)
  ) {
    return null
  }

  if (
    designatedGpuTypes.some(
      (type) => type.trim().toLowerCase() === gpuType.trim().toLowerCase()
    )
  ) {
    return null
  }

  return 'Warning: This GPU type is not designated for inference or interactive workflows. You can still book it.'
}
