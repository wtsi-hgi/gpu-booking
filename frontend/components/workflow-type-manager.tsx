'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  createWorkflowType,
  deleteWorkflowType,
  initialWorkflowTypeFormState,
  updateWorkflowType,
  type WorkflowTypeFormState,
} from '@/app/actions'
import { type WorkflowType } from '@/lib/admin-contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function upsertWorkflowType(
  list: WorkflowType[],
  workflowType: WorkflowType
): WorkflowType[] {
  const existingIndex = list.findIndex((item) => item.id === workflowType.id)
  if (existingIndex === -1) {
    return [...list, workflowType]
  }

  return list.map((item) => (item.id === workflowType.id ? workflowType : item))
}

export function removeWorkflowType(
  list: WorkflowType[],
  workflowTypeId: number
): WorkflowType[] {
  return list.filter((item) => item.id !== workflowTypeId)
}

function FormMessage({ state }: { state: WorkflowTypeFormState }) {
  if (state.status === 'error' && state.error) {
    return <p className="text-destructive text-sm">{state.error}</p>
  }

  if (state.status === 'success' && state.message) {
    return <p className="text-primary text-sm">{state.message}</p>
  }

  return null
}

type WorkflowTypeManagerProps = {
  initialWorkflowTypes: WorkflowType[]
}

export function WorkflowTypeManager({
  initialWorkflowTypes,
}: WorkflowTypeManagerProps) {
  const [workflowTypes, setWorkflowTypes] = useState(initialWorkflowTypes)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const createWorkflowTypeAction = async (
    prev: WorkflowTypeFormState,
    formData: FormData
  ) => {
    const result = await createWorkflowType(prev, formData)
    const createdWorkflowType = result.workflowType
    if (result.status === 'success' && createdWorkflowType) {
      setWorkflowTypes((current) =>
        upsertWorkflowType(current, createdWorkflowType)
      )
      setShowAddForm(false)
    }
    return result
  }

  const updateWorkflowTypeAction = async (
    prev: WorkflowTypeFormState,
    formData: FormData
  ) => {
    const result = await updateWorkflowType(prev, formData)
    const updatedWorkflowType = result.workflowType
    if (result.status === 'success' && updatedWorkflowType) {
      setWorkflowTypes((current) =>
        upsertWorkflowType(current, updatedWorkflowType)
      )
      setEditingId(null)
    }
    return result
  }

  const deleteWorkflowTypeAction = async (
    prev: WorkflowTypeFormState,
    formData: FormData
  ) => {
    const result = await deleteWorkflowType(prev, formData)
    const deletedWorkflowTypeId = result.deletedId
    if (result.status === 'success' && deletedWorkflowTypeId) {
      setWorkflowTypes((current) =>
        removeWorkflowType(current, deletedWorkflowTypeId)
      )
    }
    return result
  }

  const [createState, createAction, createPending] = useActionState(
    createWorkflowTypeAction,
    initialWorkflowTypeFormState
  )
  const [updateState, updateAction, updatePending] = useActionState(
    updateWorkflowTypeAction,
    initialWorkflowTypeFormState
  )
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteWorkflowTypeAction,
    initialWorkflowTypeFormState
  )

  useEffect(() => {
    if (createState.status === 'success' && createState.message) {
      toast.success(createState.message)
    }
    if (createState.status === 'error' && createState.error) {
      toast.error(createState.error)
    }
  }, [createState])

  useEffect(() => {
    if (updateState.status === 'success' && updateState.message) {
      toast.success(updateState.message)
    }
    if (updateState.status === 'error' && updateState.error) {
      toast.error(updateState.error)
    }
  }, [updateState])

  useEffect(() => {
    if (deleteState.status === 'success' && deleteState.message) {
      toast.success(deleteState.message)
    }
    if (deleteState.status === 'error' && deleteState.error) {
      toast.error(deleteState.error)
    }
  }, [deleteState])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Workflow Types</CardTitle>
        <Button
          type="button"
          variant={showAddForm ? 'outline' : 'default'}
          onClick={() => setShowAddForm((current) => !current)}
        >
          {showAddForm ? 'Cancel' : 'Add Workflow Type'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showAddForm && (
          <form
            action={createAction}
            className="space-y-3 rounded-lg border p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                name="name"
                required
                placeholder="Workflow type name"
                disabled={createPending}
              />
              <Button type="submit" disabled={createPending}>
                {createPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <FormMessage state={createState} />
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs tracking-wide uppercase">
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflowTypes.map((workflowType) => {
                const isEditing = editingId === workflowType.id

                return (
                  <tr
                    key={workflowType.id}
                    className="border-b align-top"
                    data-workflow-row="true"
                  >
                    {isEditing ? (
                      <td className="py-3 pr-4" colSpan={2}>
                        <form action={updateAction} className="space-y-3">
                          <input
                            type="hidden"
                            name="id"
                            value={workflowType.id}
                          />
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <Input
                              name="name"
                              required
                              defaultValue={workflowType.name}
                              disabled={updatePending}
                            />
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
                          </div>
                          <FormMessage state={updateState} />
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-3 pr-4">{workflowType.name}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingId(workflowType.id)}
                            >
                              Edit
                            </Button>
                            <form
                              action={deleteAction}
                              onSubmit={(event) => {
                                if (
                                  !window.confirm('Delete this workflow type?')
                                ) {
                                  event.preventDefault()
                                }
                              }}
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={workflowType.id}
                              />
                              <Button
                                type="submit"
                                variant="destructive"
                                disabled={deletePending}
                              >
                                {deletePending ? 'Deleting…' : 'Delete'}
                              </Button>
                            </form>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!showAddForm && <FormMessage state={deleteState} />}
      </CardContent>
    </Card>
  )
}
