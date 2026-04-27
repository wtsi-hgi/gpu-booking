'use client'

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import { adminUpdateBooking, getCapacity } from '@/app/actions'
import { BookingTable } from '@/components/booking-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  initialAdminBookingFormState,
  type AdminBookingFormState,
} from '@/lib/action-form-states'
import type {
  GramOption,
  GpuType,
  MemoryOption,
  WorkflowType,
} from '@/lib/admin-contracts'
import type { BookingResponse } from '@/lib/booking-contracts'

type AdminBookingPanelProps = {
  initialBookings: BookingResponse[]
  gpuTypes: GpuType[]
  gramOptions: GramOption[]
  memoryOptions: MemoryOption[]
  workflowTypes: WorkflowType[]
}

type BookingDraft = {
  status: BookingResponse['status']
  gpu_type_id: string
  gpu_count: string
  gram_option_id: string
  memory_option_id: string
  workflow_type_id: string
  start_date: string
  end_date: string
  alt_email: string
  project_name: string
  project_pi: string
  project_grant_number: string
  technical_lead: string
  event_start_date: string
  event_end_date: string
  admin_notes: string
}

type SelectProps = {
  id: string
  name: keyof BookingDraft
  value: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string | number }>
}

const CAPACITY_CONSUMING_STATUSES = new Set(['confirmed', 'tentative', 'spot'])
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function statusConsumesCapacity(status: BookingResponse['status']): boolean {
  return CAPACITY_CONSUMING_STATUSES.has(status)
}

function formatUtcDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function overlapsDay(day: string, startDate: string, endDate: string): boolean {
  return day >= startDate && day <= endDate
}

function toDisplayDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${formatUtcDate(date)}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function toInputDate(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

function createDraft(booking: BookingResponse): BookingDraft {
  return {
    status: booking.status,
    gpu_type_id: String(booking.gpu_type_id),
    gpu_count: String(booking.gpu_count),
    gram_option_id: String(booking.gram_option_id),
    memory_option_id: String(booking.memory_option_id),
    workflow_type_id: String(booking.workflow_type_id),
    start_date: toInputDate(booking.start_date),
    end_date: toInputDate(booking.end_date),
    alt_email: booking.alt_email ?? '',
    project_name: booking.project_name ?? '',
    project_pi: booking.project_pi ?? '',
    project_grant_number: booking.project_grant_number ?? '',
    technical_lead: booking.technical_lead ?? '',
    event_start_date: toInputDate(booking.event_start_date),
    event_end_date: toInputDate(booking.event_end_date),
    admin_notes: booking.admin_notes ?? '',
  }
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function SelectField({ id, name, value, onChange, options }: SelectProps) {
  return (
    <select
      id={id}
      name={name}
      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function AdminBookingPanel({
  initialBookings,
  gpuTypes,
  gramOptions,
  memoryOptions,
  workflowTypes,
}: AdminBookingPanelProps) {
  const [bookings, setBookings] = useState(initialBookings)
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null
  )
  const [draft, setDraft] = useState<BookingDraft | null>(null)
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null)

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  )

  const updateBookingAction = async (
    prev: AdminBookingFormState,
    formData: FormData
  ) => {
    const result = await adminUpdateBooking(prev, formData)
    if (result.status === 'success' && result.booking) {
      setBookings((current) =>
        current.map((booking) =>
          booking.id === result.booking.id ? result.booking : booking
        )
      )
      setSelectedBookingId(result.booking.id)
      setDraft(createDraft(result.booking))
      setCapacityWarning(null)
    }
    return result
  }

  const [state, formAction, pending] = useActionState(
    updateBookingAction,
    initialAdminBookingFormState
  )

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast.success(state.message)
    }
    if (state.status === 'error' && state.error) {
      toast.error(state.error)
    }
  }, [state])

  useEffect(() => {
    if (!selectedBooking || !draft) {
      return
    }

    if (!statusConsumesCapacity(draft.status)) {
      return
    }

    const gpuTypeId = Number.parseInt(draft.gpu_type_id, 10)
    const gpuCount = Number.parseInt(draft.gpu_count, 10)
    if (
      !Number.isInteger(gpuTypeId) ||
      gpuTypeId <= 0 ||
      !Number.isInteger(gpuCount) ||
      gpuCount <= 0 ||
      !draft.start_date ||
      !draft.end_date
    ) {
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const capacity = await getCapacity(
          draft.start_date,
          draft.end_date,
          gpuTypeId
        )
        if (cancelled) {
          return
        }

        const exceededDays = capacity
          .filter((day) => {
            let confirmedUsed = day.confirmed_used

            if (
              selectedBooking.gpu_type_id === gpuTypeId &&
              statusConsumesCapacity(selectedBooking.status) &&
              overlapsDay(
                day.date,
                selectedBooking.start_date,
                selectedBooking.end_date
              )
            ) {
              confirmedUsed = Math.max(
                0,
                confirmedUsed - selectedBooking.gpu_count
              )
            }

            return confirmedUsed + gpuCount > day.total
          })
          .map((day) => day.date)

        if (exceededDays.length > 0) {
          setCapacityWarning(
            `Capacity warning: setting status to ${draft.status} would exceed 100% capacity on ${exceededDays.join(', ')}.`
          )
          return
        }

        setCapacityWarning(null)
      } catch {
        if (!cancelled) {
          setCapacityWarning(
            'Capacity warning could not be calculated right now.'
          )
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [draft, selectedBooking])

  function updateDraft<K extends keyof BookingDraft>(
    key: K,
    value: BookingDraft[K]
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setCapacityWarning(null)
  }

  return (
    <section className="space-y-4" data-testid="admin-bookings-management">
      <BookingTable
        bookings={bookings}
        isAdmin
        showCancelledBookings
        onBookingSelect={(booking) => {
          setSelectedBookingId(booking.id)
          setDraft(createDraft(booking))
          setCapacityWarning(null)
        }}
      />

      {selectedBooking && draft ? (
        <aside
          className="border-border bg-background fixed top-0 right-0 z-30 h-full w-full overflow-y-auto border-l p-4 shadow-lg sm:w-[640px]"
          data-testid="admin-booking-side-panel"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">
                Edit Booking #{selectedBooking.id}
              </h2>
              <p className="text-muted-foreground text-sm">
                {selectedBooking.user_email}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedBookingId(null)
                setDraft(null)
                setCapacityWarning(null)
              }}
            >
              Close
            </Button>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="booking_id" value={selectedBooking.id} />

            <div className="grid gap-3 md:grid-cols-2">
              <Field id="status" label="Status">
                <SelectField
                  id="status"
                  name="status"
                  value={draft.status}
                  onChange={(value) =>
                    updateDraft('status', value as BookingResponse['status'])
                  }
                  options={[
                    { label: 'Unconfirmed', value: 'unconfirmed' },
                    { label: 'Confirmed', value: 'confirmed' },
                    { label: 'Tentative', value: 'tentative' },
                    { label: 'Spot Booking', value: 'spot' },
                    { label: 'Rejected', value: 'rejected' },
                    { label: 'Cancelled', value: 'cancelled' },
                  ]}
                />
              </Field>

              <Field id="gpu_type_id" label="GPU Type">
                <SelectField
                  id="gpu_type_id"
                  name="gpu_type_id"
                  value={draft.gpu_type_id}
                  onChange={(value) => updateDraft('gpu_type_id', value)}
                  options={gpuTypes.map((gpuType) => ({
                    label: gpuType.name,
                    value: gpuType.id,
                  }))}
                />
              </Field>

              <Field id="gpu_count" label="GPU Count">
                <Input
                  id="gpu_count"
                  name="gpu_count"
                  type="number"
                  min={1}
                  value={draft.gpu_count}
                  onChange={(event) =>
                    updateDraft('gpu_count', event.target.value)
                  }
                />
              </Field>

              <Field id="gram_option_id" label="GRAM">
                <SelectField
                  id="gram_option_id"
                  name="gram_option_id"
                  value={draft.gram_option_id}
                  onChange={(value) => updateDraft('gram_option_id', value)}
                  options={gramOptions.map((option) => ({
                    label: option.label,
                    value: option.id,
                  }))}
                />
              </Field>

              <Field id="memory_option_id" label="System Memory">
                <SelectField
                  id="memory_option_id"
                  name="memory_option_id"
                  value={draft.memory_option_id}
                  onChange={(value) => updateDraft('memory_option_id', value)}
                  options={memoryOptions.map((option) => ({
                    label: option.label,
                    value: option.id,
                  }))}
                />
              </Field>

              <Field id="workflow_type_id" label="Workflow Type">
                <SelectField
                  id="workflow_type_id"
                  name="workflow_type_id"
                  value={draft.workflow_type_id}
                  onChange={(value) => updateDraft('workflow_type_id', value)}
                  options={workflowTypes.map((workflowType) => ({
                    label: workflowType.name,
                    value: workflowType.id,
                  }))}
                />
              </Field>

              <Field id="start_date" label="Start Date">
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={draft.start_date}
                  onChange={(event) =>
                    updateDraft('start_date', event.target.value)
                  }
                />
              </Field>

              <Field id="end_date" label="End Date">
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={draft.end_date}
                  onChange={(event) =>
                    updateDraft('end_date', event.target.value)
                  }
                />
              </Field>

              <Field id="alt_email" label="Alternate Email">
                <Input
                  id="alt_email"
                  name="alt_email"
                  type="email"
                  value={draft.alt_email}
                  onChange={(event) =>
                    updateDraft('alt_email', event.target.value)
                  }
                />
              </Field>

              <Field id="project_name" label="Project Name">
                <Input
                  id="project_name"
                  name="project_name"
                  value={draft.project_name}
                  onChange={(event) =>
                    updateDraft('project_name', event.target.value)
                  }
                />
              </Field>

              <Field id="project_pi" label="Project PI">
                <Input
                  id="project_pi"
                  name="project_pi"
                  value={draft.project_pi}
                  onChange={(event) =>
                    updateDraft('project_pi', event.target.value)
                  }
                />
              </Field>

              <Field id="project_grant_number" label="Project Grant Number">
                <Input
                  id="project_grant_number"
                  name="project_grant_number"
                  value={draft.project_grant_number}
                  onChange={(event) =>
                    updateDraft('project_grant_number', event.target.value)
                  }
                />
              </Field>

              <Field id="technical_lead" label="Technical Lead">
                <Input
                  id="technical_lead"
                  name="technical_lead"
                  value={draft.technical_lead}
                  onChange={(event) =>
                    updateDraft('technical_lead', event.target.value)
                  }
                />
              </Field>

              <Field id="event_start_date" label="Event Start Date">
                <Input
                  id="event_start_date"
                  name="event_start_date"
                  type="date"
                  value={draft.event_start_date}
                  onChange={(event) =>
                    updateDraft('event_start_date', event.target.value)
                  }
                />
              </Field>

              <Field id="event_end_date" label="Event End Date">
                <Input
                  id="event_end_date"
                  name="event_end_date"
                  type="date"
                  value={draft.event_end_date}
                  onChange={(event) =>
                    updateDraft('event_end_date', event.target.value)
                  }
                />
              </Field>
            </div>

            <Field id="admin_notes" label="Admin Notes">
              <textarea
                id="admin_notes"
                name="admin_notes"
                rows={4}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={draft.admin_notes}
                onChange={(event) =>
                  updateDraft('admin_notes', event.target.value)
                }
              />
            </Field>

            {capacityWarning ? (
              <div
                className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border p-3 text-sm"
                data-testid="admin-capacity-warning"
              >
                {capacityWarning}
              </div>
            ) : null}

            {state.status === 'error' && state.error ? (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            ) : null}

            <div className="flex items-center justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>

          <div className="border-border text-muted-foreground mt-6 space-y-1 border-t pt-4 text-sm">
            <p>Last Modified By: {selectedBooking.admin_modified_by ?? '—'}</p>
            <p>
              Last Modified At:{' '}
              {toDisplayDateTime(selectedBooking.admin_modified_at)}
            </p>
          </div>
        </aside>
      ) : null}
    </section>
  )
}
