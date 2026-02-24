'use client'

import { useActionState, useState } from 'react'

import {
  createGpuType,
  initialFormState,
  updateGpuType,
  type FormState,
} from '@/app/actions'
import { type GpuType } from '@/lib/admin-contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function upsertGpuType(list: GpuType[], gpuType: GpuType): GpuType[] {
  const existingIndex = list.findIndex((item) => item.id === gpuType.id)
  if (existingIndex === -1) {
    return [...list, gpuType]
  }

  return list.map((item) => (item.id === gpuType.id ? gpuType : item))
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

type GpuTypeManagerProps = {
  initialGpuTypes: GpuType[]
}

export function GpuTypeManager({ initialGpuTypes }: GpuTypeManagerProps) {
  const [gpuTypes, setGpuTypes] = useState(initialGpuTypes)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const createGpuTypeAction = async (prev: FormState, formData: FormData) => {
    const nextState = await createGpuType(prev, formData)
    if (nextState.status === 'success' && nextState.gpuType) {
      setGpuTypes((current) => upsertGpuType(current, nextState.gpuType))
      setShowAddForm(false)
    }
    return nextState
  }

  const updateGpuTypeAction = async (prev: FormState, formData: FormData) => {
    const nextState = await updateGpuType(prev, formData)
    if (nextState.status === 'success' && nextState.gpuType) {
      setGpuTypes((current) => upsertGpuType(current, nextState.gpuType))
      setEditingId(null)
    }
    return nextState
  }

  const [createState, createAction, createPending] = useActionState(
    createGpuTypeAction,
    initialFormState
  )
  const [updateState, updateAction, updatePending] = useActionState(
    updateGpuTypeAction,
    initialFormState
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>GPU Types</CardTitle>
        <Button
          type="button"
          variant={showAddForm ? 'outline' : 'default'}
          onClick={() => setShowAddForm((current) => !current)}
        >
          {showAddForm ? 'Cancel' : 'Add GPU Type'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <form
            action={createAction}
            className="space-y-3 rounded-lg border p-4"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                name="name"
                required
                placeholder="Name"
                disabled={createPending}
              />
              <Input
                name="gram_gb"
                required
                type="number"
                min={1}
                placeholder="GRAM"
                disabled={createPending}
              />
              <Input
                name="system_memory_gb"
                required
                type="number"
                min={1}
                placeholder="System Memory"
                disabled={createPending}
              />
              <Input
                name="total_count"
                required
                type="number"
                min={1}
                placeholder="Total Count"
                disabled={createPending}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createPending}>
                {createPending ? 'Saving…' : 'Save'}
              </Button>
              <FormMessage state={createState} />
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs tracking-wide uppercase">
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">GRAM</th>
                <th className="py-3 pr-4 font-medium">System Memory</th>
                <th className="py-3 pr-4 font-medium">Total Count</th>
                <th className="py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gpuTypes.map((gpuType) => {
                const isEditing = editingId === gpuType.id
                return (
                  <tr
                    key={gpuType.id}
                    className="border-b align-top"
                    data-gpu-row="true"
                  >
                    {isEditing ? (
                      <td className="py-3 pr-4" colSpan={5}>
                        <form action={updateAction} className="space-y-3">
                          <input type="hidden" name="id" value={gpuType.id} />
                          <div className="grid gap-3 md:grid-cols-4">
                            <Input
                              name="name"
                              required
                              defaultValue={gpuType.name}
                              disabled={updatePending}
                            />
                            <Input
                              name="gram_gb"
                              required
                              type="number"
                              min={1}
                              defaultValue={gpuType.gram_gb}
                              disabled={updatePending}
                            />
                            <Input
                              name="system_memory_gb"
                              required
                              type="number"
                              min={1}
                              defaultValue={gpuType.system_memory_gb}
                              disabled={updatePending}
                            />
                            <Input
                              name="total_count"
                              required
                              type="number"
                              min={1}
                              defaultValue={gpuType.total_count}
                              disabled={updatePending}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <Button type="submit" disabled={updatePending}>
                              {updatePending ? 'Saving…' : 'Save'}
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
                        <td className="py-3 pr-4">{gpuType.name}</td>
                        <td className="py-3 pr-4">{gpuType.gram_gb} GB</td>
                        <td className="py-3 pr-4">
                          {gpuType.system_memory_gb} GB
                        </td>
                        <td className="py-3 pr-4">{gpuType.total_count}</td>
                        <td className="py-3 pr-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditingId(gpuType.id)}
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
