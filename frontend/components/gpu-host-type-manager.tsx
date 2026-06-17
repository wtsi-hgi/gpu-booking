'use client'

import { useActionState, useState } from 'react'

import { createGpuHostType, updateGpuHostType } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { initialFormState, type FormState } from '@/lib/action-form-states'
import { formatGpuHostTypeLabel, type GpuHostType } from '@/lib/admin-contracts'

export function upsertGpuHostType(
  list: GpuHostType[],
  gpuHostType: GpuHostType
): GpuHostType[] {
  const existingIndex = list.findIndex((item) => item.id === gpuHostType.id)
  if (existingIndex === -1) {
    return [...list, gpuHostType]
  }

  return list.map((item) => (item.id === gpuHostType.id ? gpuHostType : item))
}

function FormMessage({ state }: { state: FormState }) {
  if (state.status === 'error' && state.error) {
    return <p className="text-destructive text-sm">{state.error}</p>
  }
  if (state.status === 'success' && state.message) {
    return <p className="text-primary text-sm">{state.message}</p>
  }
  return null
}

type GpuHostTypeManagerProps = {
  initialGpuHostTypes: GpuHostType[]
}

export function GpuHostTypeManager({
  initialGpuHostTypes,
}: GpuHostTypeManagerProps) {
  const [gpuHostTypes, setGpuHostTypes] = useState(initialGpuHostTypes)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const createGpuHostTypeAction = async (
    prev: FormState,
    formData: FormData
  ) => {
    const nextState = await createGpuHostType(prev, formData)
    const createdGpuHostType = nextState.gpuHostType
    if (nextState.status === 'success' && createdGpuHostType) {
      setGpuHostTypes((current) =>
        upsertGpuHostType(current, createdGpuHostType)
      )
      setShowAddForm(false)
    }
    return nextState
  }

  const updateGpuHostTypeAction = async (
    prev: FormState,
    formData: FormData
  ) => {
    const nextState = await updateGpuHostType(prev, formData)
    const updatedGpuHostType = nextState.gpuHostType
    if (nextState.status === 'success' && updatedGpuHostType) {
      setGpuHostTypes((current) =>
        upsertGpuHostType(current, updatedGpuHostType)
      )
      setEditingId(null)
    }
    return nextState
  }

  const [createState, createAction, createPending] = useActionState(
    createGpuHostTypeAction,
    initialFormState
  )
  const [updateState, updateAction, updatePending] = useActionState(
    updateGpuHostTypeAction,
    initialFormState
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>GPU Host Types</CardTitle>
        <Button
          type="button"
          variant={showAddForm ? 'outline' : 'default'}
          onClick={() => setShowAddForm((current) => !current)}
        >
          {showAddForm ? 'Cancel' : 'Add GPU Host Type'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <form
            action={createAction}
            className="space-y-3 rounded-lg border p-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                name="gpu_type"
                required
                placeholder="GPU type"
                disabled={createPending}
              />
              <Input
                name="gpu_count"
                required
                type="number"
                min={1}
                placeholder="GPUs per host"
                disabled={createPending}
              />
              <Input
                name="total_count"
                required
                type="number"
                min={0}
                placeholder="Available hosts"
                disabled={createPending}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createPending}>
                {createPending ? 'Saving...' : 'Save'}
              </Button>
              <FormMessage state={createState} />
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs tracking-wide uppercase">
                <th className="py-3 pr-4 font-medium">GPU Host Type</th>
                <th className="py-3 pr-4 font-medium">GPU Type</th>
                <th className="py-3 pr-4 font-medium">GPUs per Host</th>
                <th className="py-3 pr-4 font-medium">Available Hosts</th>
                <th className="py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gpuHostTypes.map((gpuHostType) => {
                const isEditing = editingId === gpuHostType.id
                return (
                  <tr
                    key={gpuHostType.id}
                    className="border-b align-top"
                    data-gpu-host-row="true"
                  >
                    {isEditing ? (
                      <td className="py-3 pr-4" colSpan={5}>
                        <form action={updateAction} className="space-y-3">
                          <input
                            type="hidden"
                            name="id"
                            value={gpuHostType.id}
                          />
                          <div className="grid gap-3 md:grid-cols-3">
                            <Input
                              name="gpu_type"
                              required
                              defaultValue={gpuHostType.gpu_type}
                              disabled={updatePending}
                            />
                            <Input
                              name="gpu_count"
                              required
                              type="number"
                              min={1}
                              defaultValue={gpuHostType.gpu_count}
                              disabled={updatePending}
                            />
                            <Input
                              name="total_count"
                              required
                              type="number"
                              min={0}
                              defaultValue={gpuHostType.total_count}
                              disabled={updatePending}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <Button type="submit" disabled={updatePending}>
                              {updatePending ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                              disabled={updatePending}
                            >
                              Cancel
                            </Button>
                            <FormMessage state={updateState} />
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-3 pr-4 font-medium">
                          {formatGpuHostTypeLabel(gpuHostType)}
                        </td>
                        <td className="py-3 pr-4">{gpuHostType.gpu_type}</td>
                        <td className="py-3 pr-4">{gpuHostType.gpu_count}</td>
                        <td className="py-3 pr-4">{gpuHostType.total_count}</td>
                        <td className="py-3 pr-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditingId(gpuHostType.id)}
                          >
                            Edit
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
