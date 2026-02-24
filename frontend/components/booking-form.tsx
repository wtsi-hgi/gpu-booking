'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { createBooking, validateBooking } from '@/app/actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type {
  GramOption,
  GpuType,
  MemoryOption,
  WorkflowType,
} from '@/lib/admin-contracts'
import type { BookingValidation } from '@/lib/booking-contracts'
import {
  buildRequiredFieldErrors,
  initialBookingFormState,
  requiredBookingFields,
  type BookingFieldName,
} from '@/lib/booking-state'

type BookingFormProps = {
  gpuTypes: GpuType[]
  gramOptions: GramOption[]
  memoryOptions: MemoryOption[]
  workflowTypes: WorkflowType[]
  initialStartDate?: string
  initialEndDate?: string
}

function validateRequiredFields(
  formData: FormData
): Partial<Record<BookingFieldName, string>> {
  const missingFields: BookingFieldName[] = []

  for (const field of requiredBookingFields) {
    const value = (formData.get(field) ?? '').toString().trim()
    if (!value) {
      missingFields.push(field)
      continue
    }

    if (field === 'gpu_count') {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        missingFields.push(field)
      }
    }
  }

  return buildRequiredFieldErrors(missingFields)
}

export function BookingForm({
  gpuTypes,
  gramOptions,
  memoryOptions,
  workflowTypes,
  initialStartDate,
  initialEndDate,
}: BookingFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(
    createBooking,
    initialBookingFormState
  )
  const [fieldErrors, setFieldErrors] = useState(state.fieldErrors)
  const [validationResult, setValidationResult] =
    useState<BookingValidation | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    if (state.status === 'error' && Object.keys(state.fieldErrors).length > 0) {
      setFieldErrors(state.fieldErrors)
    }

    if (state.status === 'success') {
      toast.success(state.message ?? 'Booking created successfully.')
      router.push('/bookings')
      return
    }

    if (state.status === 'error' && state.error) {
      toast.error(state.error)
    }
  }, [router, state])

  const hasBlockingValidation = validationResult?.blocked === true

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Create Booking</CardTitle>
        <CardDescription>
          Request GPU resources for your project and validate before submitting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          action={formAction}
          className="space-y-6"
          onSubmit={(event) => {
            const formData = new FormData(event.currentTarget)
            const nextFieldErrors = validateRequiredFields(formData)
            setFieldErrors(nextFieldErrors)
            if (Object.keys(nextFieldErrors).length > 0) {
              event.preventDefault()
            }
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="gpu_type_id" className="text-sm font-medium">
                GPU Type
              </label>
              <select
                id="gpu_type_id"
                name="gpu_type_id"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.gpu_type_id)}
              >
                <option value="">Select GPU type</option>
                {gpuTypes.map((gpuType) => (
                  <option key={gpuType.id} value={gpuType.id}>
                    {gpuType.name}
                  </option>
                ))}
              </select>
              {fieldErrors.gpu_type_id && (
                <p className="text-destructive text-sm">
                  {fieldErrors.gpu_type_id}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="gpu_count" className="text-sm font-medium">
                GPU Count
              </label>
              <Input
                id="gpu_count"
                name="gpu_count"
                type="number"
                min={1}
                aria-invalid={Boolean(fieldErrors.gpu_count)}
              />
              {fieldErrors.gpu_count && (
                <p className="text-destructive text-sm">
                  {fieldErrors.gpu_count}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="gram_option_id" className="text-sm font-medium">
                GRAM
              </label>
              <select
                id="gram_option_id"
                name="gram_option_id"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.gram_option_id)}
              >
                <option value="">Select GRAM</option>
                {gramOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.gram_option_id && (
                <p className="text-destructive text-sm">
                  {fieldErrors.gram_option_id}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="memory_option_id" className="text-sm font-medium">
                System Memory
              </label>
              <select
                id="memory_option_id"
                name="memory_option_id"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.memory_option_id)}
              >
                <option value="">Select System Memory</option>
                {memoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.memory_option_id && (
                <p className="text-destructive text-sm">
                  {fieldErrors.memory_option_id}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="workflow_type_id" className="text-sm font-medium">
                Workflow Type
              </label>
              <select
                id="workflow_type_id"
                name="workflow_type_id"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.workflow_type_id)}
              >
                <option value="">Select workflow type</option>
                {workflowTypes.map((workflowType) => (
                  <option key={workflowType.id} value={workflowType.id}>
                    {workflowType.name}
                  </option>
                ))}
              </select>
              {fieldErrors.workflow_type_id && (
                <p className="text-destructive text-sm">
                  {fieldErrors.workflow_type_id}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="alt_email" className="text-sm font-medium">
                Alternate Email
              </label>
              <Input id="alt_email" name="alt_email" type="email" />
            </div>

            <div className="space-y-1">
              <label htmlFor="start_date" className="text-sm font-medium">
                Start Date
              </label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={initialStartDate}
                aria-invalid={Boolean(fieldErrors.start_date)}
              />
              {fieldErrors.start_date && (
                <p className="text-destructive text-sm">
                  {fieldErrors.start_date}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="end_date" className="text-sm font-medium">
                End Date
              </label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                defaultValue={initialEndDate}
                aria-invalid={Boolean(fieldErrors.end_date)}
              />
              {fieldErrors.end_date && (
                <p className="text-destructive text-sm">
                  {fieldErrors.end_date}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="project_name" className="text-sm font-medium">
                Project Name
              </label>
              <Input id="project_name" name="project_name" type="text" />
            </div>

            <div className="space-y-1">
              <label htmlFor="project_pi" className="text-sm font-medium">
                PI/Lead
              </label>
              <Input id="project_pi" name="project_pi" type="text" />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="project_grant_number"
                className="text-sm font-medium"
              >
                Grant Number
              </label>
              <Input
                id="project_grant_number"
                name="project_grant_number"
                type="text"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="technical_lead" className="text-sm font-medium">
                Technical Lead
              </label>
              <Input id="technical_lead" name="technical_lead" type="text" />
            </div>

            <div className="space-y-1">
              <label htmlFor="event_start_date" className="text-sm font-medium">
                Event Start Date
              </label>
              <Input
                id="event_start_date"
                name="event_start_date"
                type="date"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="event_end_date" className="text-sm font-medium">
                Event End Date
              </label>
              <Input id="event_end_date" name="event_end_date" type="date" />
            </div>
          </div>

          {validationError && (
            <div className="text-destructive border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm">
              {validationError}
            </div>
          )}

          {validationResult?.warnings.map((warning) => (
            <div
              key={`${warning.rule}-${warning.message}`}
              className={
                warning.severity === 'block'
                  ? 'text-destructive border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm'
                  : 'bg-secondary text-secondary-foreground rounded-md border p-3 text-sm'
              }
              data-validation-severity={warning.severity}
            >
              {warning.message}
            </div>
          ))}

          {validationResult &&
            !validationResult.blocked &&
            validationResult.warnings.length === 0 && (
              <div className="bg-secondary text-foreground rounded-md border p-3 text-sm">
                No issues found
              </div>
            )}

          {validationResult?.blocked && validationResult.block_reason && (
            <div className="text-destructive border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm">
              {validationResult.block_reason}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const form = formRef.current
                if (!form) {
                  return
                }

                const formData = new FormData(form)
                const nextFieldErrors = validateRequiredFields(formData)
                setFieldErrors(nextFieldErrors)
                if (Object.keys(nextFieldErrors).length > 0) {
                  return
                }

                setValidationError(null)
                setValidating(true)

                try {
                  const response = await validateBooking(formData)
                  setValidationResult(response)
                } catch (error) {
                  setValidationResult(null)
                  setValidationError(
                    error instanceof Error
                      ? error.message
                      : 'Failed to validate booking.'
                  )
                } finally {
                  setValidating(false)
                }
              }}
              disabled={pending || validating}
            >
              {validating ? 'Validating…' : 'Validate'}
            </Button>
            <Button
              type="submit"
              onClick={(event) => {
                const form = formRef.current
                if (!form) {
                  return
                }

                const formData = new FormData(form)
                const nextFieldErrors = validateRequiredFields(formData)
                setFieldErrors(nextFieldErrors)

                if (Object.keys(nextFieldErrors).length > 0) {
                  event.preventDefault()
                }
              }}
              disabled={pending || validating || hasBlockingValidation}
            >
              {pending ? 'Creating Booking…' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
