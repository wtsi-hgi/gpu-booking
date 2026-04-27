'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { mutateGramOptions, mutateMemoryOptions } from '@/app/actions'
import { type OptionFormState } from '@/lib/action-form-states'
import { type GramOption, type MemoryOption } from '@/lib/admin-contracts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type BaseOption = {
  id: number
  label: string
  value_gb: number
  sort_order: number
}

interface OptionSectionProps<T extends BaseOption> {
  title: string
  description: string
  sectionKey: 'gram' | 'memory'
  items: T[]
  action: (formData: FormData) => void
  pending: boolean
  editingId: number | null
  setEditingId: (id: number | null) => void
  devUserEmail?: string
}

function OptionSection<T extends BaseOption>({
  title,
  description,
  sectionKey,
  items,
  action,
  pending,
  editingId,
  setEditingId,
  devUserEmail,
}: OptionSectionProps<T>) {
  return (
    <Card data-testid={`${sectionKey}-section`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={action} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="intent" value="add" />
          <input
            type="hidden"
            name="dev_user_email"
            value={devUserEmail ?? ''}
          />
          <Input
            name="label"
            placeholder="Label"
            required
            disabled={pending}
            aria-label={`${title} label`}
          />
          <Input
            name="value_gb"
            type="number"
            min={1}
            placeholder="Value GB"
            required
            disabled={pending}
            aria-label={`${title} value GB`}
          />
          <Input
            name="sort_order"
            type="number"
            placeholder="Sort Order"
            required
            disabled={pending}
            aria-label={`${title} sort order`}
          />
          <Button type="submit" disabled={pending}>
            Add
          </Button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Value GB</th>
                <th className="px-3 py-2 font-medium">Sort Order</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isEditing = editingId === item.id

                if (isEditing) {
                  return (
                    <tr
                      key={item.id}
                      className="border-border border-b"
                      data-testid={`${sectionKey}-row`}
                    >
                      <td className="px-3 py-2" colSpan={4}>
                        <form
                          action={action}
                          className="grid gap-3 md:grid-cols-6"
                        >
                          <input type="hidden" name="intent" value="edit" />
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            type="hidden"
                            name="dev_user_email"
                            value={devUserEmail ?? ''}
                          />
                          <Input
                            name="label"
                            defaultValue={item.label}
                            required
                            disabled={pending}
                            className="md:col-span-2"
                          />
                          <Input
                            name="value_gb"
                            type="number"
                            min={1}
                            defaultValue={item.value_gb}
                            required
                            disabled={pending}
                          />
                          <Input
                            name="sort_order"
                            type="number"
                            defaultValue={item.sort_order}
                            required
                            disabled={pending}
                          />
                          <Button type="submit" disabled={pending}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={item.id}
                    className="border-border border-b"
                    data-testid={`${sectionKey}-row`}
                  >
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2">{item.value_gb}</td>
                    <td className="px-3 py-2">{item.sort_order}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(item.id)}
                          disabled={pending}
                        >
                          Edit
                        </Button>
                        <form action={action}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            type="hidden"
                            name="dev_user_email"
                            value={devUserEmail ?? ''}
                          />
                          <Button
                            type="submit"
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                          >
                            Delete
                          </Button>
                        </form>
                      </div>
                    </td>
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

interface MemoryOptionManagerProps {
  gramOptions: GramOption[]
  memoryOptions: MemoryOption[]
  devUserEmail?: string
}

export function MemoryOptionManager({
  gramOptions,
  memoryOptions,
  devUserEmail,
}: MemoryOptionManagerProps) {
  const [editingGramId, setEditingGramId] = useState<number | null>(null)
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null)

  const [gramState, gramAction, gramPending] = useActionState<
    OptionFormState<GramOption>,
    FormData
  >(mutateGramOptions, {
    status: 'idle',
    message: null,
    error: null,
    items: gramOptions,
  })

  const [memoryState, memoryAction, memoryPending] = useActionState<
    OptionFormState<MemoryOption>,
    FormData
  >(mutateMemoryOptions, {
    status: 'idle',
    message: null,
    error: null,
    items: memoryOptions,
  })

  useEffect(() => {
    if (gramState.status === 'success') {
      if (gramState.message) {
        toast.success(gramState.message)
      }
    }
    if (gramState.status === 'error' && gramState.error) {
      toast.error(gramState.error)
    }
  }, [gramState])

  useEffect(() => {
    if (memoryState.status === 'success') {
      if (memoryState.message) {
        toast.success(memoryState.message)
      }
    }
    if (memoryState.status === 'error' && memoryState.error) {
      toast.error(memoryState.error)
    }
  }, [memoryState])

  return (
    <div className="space-y-6">
      <OptionSection
        title="GRAM Options"
        description="Manage GRAM dropdown choices used by booking forms."
        sectionKey="gram"
        items={gramState.items}
        action={gramAction}
        pending={gramPending}
        editingId={editingGramId}
        setEditingId={setEditingGramId}
        devUserEmail={devUserEmail}
      />
      <OptionSection
        title="System Memory Options"
        description="Manage system memory dropdown choices used by booking forms."
        sectionKey="memory"
        items={memoryState.items}
        action={memoryAction}
        pending={memoryPending}
        editingId={editingMemoryId}
        setEditingId={setEditingMemoryId}
        devUserEmail={devUserEmail}
      />
    </div>
  )
}
