'use client'

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  createBooking,
  getHostTypeAvailability,
  validateBooking,
} from '@/app/actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { GpuHostType, WorkflowType } from '@/lib/admin-contracts'
import { formatGpuHostTypeLabel } from '@/lib/admin-contracts'
import type {
  BookingValidation,
  HostTypeAvailability,
} from '@/lib/booking-contracts'
import {
  buildRequiredFieldErrors,
  createInitialBookingFormValues,
  initialBookingFormState,
  requiredBookingFields,
  type BookingFieldName,
  type BookingFormValueName,
  type BookingFormValues,
} from '@/lib/booking-state'

type BookingFormProps = {
  gpuHostTypes: GpuHostType[]
  workflowTypes: WorkflowType[]
  initialStartDate?: string
  initialEndDate?: string
}

type ValidationFeedback = {
  messages: string[]
  severity: 'warning' | 'block'
}

type FieldValidationFeedback = Partial<
  Record<BookingFieldName, ValidationFeedback>
>

type AvailabilityState = {
  rangeKey: string
  items: HostTypeAvailability[]
}

const START_DATE_FUTURE_MESSAGE = 'Start date must be in the future'
const START_DATE_BEFORE_END_DATE_MESSAGE = 'Start date must be before end date'
const WARNING_SUMMARY_SCROLL_PADDING_PX = 16
const datePattern = /^\d{4}-\d{2}-\d{2}$/

const validationRuleFieldMap: Partial<Record<string, BookingFieldName>> = {
  advance_notice_min_14_days: 'start_date',
  duration_gt_14_days: 'end_date',
  duration_max_14_days: 'end_date',
  capacity_hard_limit: 'host_count',
  capacity_soft_limit: 'host_count',
  user_capacity_40_percent: 'host_count',
}

function buildFormValues(
  values: Partial<BookingFormValues> | undefined,
  initialStartDate?: string,
  initialEndDate?: string
): BookingFormValues {
  const nextValues = createInitialBookingFormValues(values ?? {})

  if (!nextValues.start_date && initialStartDate) {
    nextValues.start_date = initialStartDate
  }

  if (!nextValues.end_date && initialEndDate) {
    nextValues.end_date = initialEndDate
  }

  if (!nextValues.event_start_date && nextValues.start_date) {
    nextValues.event_start_date = nextValues.start_date
  }

  if (!nextValues.event_end_date && nextValues.end_date) {
    nextValues.event_end_date = nextValues.end_date
  }

  return nextValues
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

    if (field === 'host_count') {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        missingFields.push(field)
      }
    }
  }

  return buildRequiredFieldErrors(missingFields)
}

function getTodayInputValue(): string {
  const today = new Date()
  const year = String(today.getFullYear())
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getAvailabilityRangeKey(startDate: string, endDate: string) {
  if (
    !datePattern.test(startDate) ||
    !datePattern.test(endDate) ||
    startDate > endDate
  ) {
    return null
  }

  return `${startDate}:${endDate}`
}

function getHostTypeId(value: string): number | null {
  const id = Number.parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function constrainHostCountValue(value: string, max: number): string {
  if (!value || max <= 0) {
    return ''
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) {
    return ''
  }

  return String(Math.min(Math.max(parsed, 1), max))
}

function addValidationFeedback(
  feedback: FieldValidationFeedback,
  field: BookingFieldName,
  message: string,
  severity: ValidationFeedback['severity']
): FieldValidationFeedback {
  const existing = feedback[field]

  if (!existing) {
    return {
      ...feedback,
      [field]: {
        messages: [message],
        severity,
      },
    }
  }

  const nextMessages = existing.messages.includes(message)
    ? existing.messages
    : [...existing.messages, message]

  return {
    ...feedback,
    [field]: {
      messages: nextMessages,
      severity:
        existing.severity === 'block' || severity === 'block'
          ? 'block'
          : 'warning',
    },
  }
}

function mergeValidationFeedback(
  base: FieldValidationFeedback,
  override: FieldValidationFeedback
): FieldValidationFeedback {
  return (Object.keys(override) as BookingFieldName[]).reduce(
    (merged, field) => {
      const feedback = override[field]

      if (!feedback) {
        return merged
      }

      return feedback.messages.reduce<FieldValidationFeedback>(
        (next, message) =>
          addValidationFeedback(next, field, message, feedback.severity),
        merged
      )
    },
    base
  )
}

function getFieldForValidationRule(rule: string): BookingFieldName | null {
  if (rule in validationRuleFieldMap) {
    return validationRuleFieldMap[rule] ?? null
  }

  if (rule.includes('capacity')) {
    return 'host_count'
  }

  if (rule.startsWith('duration_')) {
    return 'end_date'
  }

  return null
}

function getFieldForBlockReason(
  blockReason: string | null
): BookingFieldName | null {
  if (!blockReason) {
    return null
  }

  const normalizedReason = blockReason.toLowerCase()

  if (normalizedReason.includes('capacity')) {
    return 'host_count'
  }

  if (normalizedReason.includes('gpu host type')) {
    return 'gpu_host_type_id'
  }

  return null
}

function getValidationFeedback(result: BookingValidation | null): {
  fieldFeedback: FieldValidationFeedback
  genericBlockMessage: string | null
} {
  if (!result) {
    return {
      fieldFeedback: {},
      genericBlockMessage: null,
    }
  }

  let fieldFeedback: FieldValidationFeedback = {}

  for (const warning of result.warnings) {
    const field = getFieldForValidationRule(warning.rule)

    if (!field) {
      continue
    }

    fieldFeedback = addValidationFeedback(
      fieldFeedback,
      field,
      warning.message,
      warning.severity
    )
  }

  if (!result.blocked) {
    return {
      fieldFeedback,
      genericBlockMessage: null,
    }
  }

  const blockingWarning = result.warnings.find(
    (warning) => warning.severity === 'block'
  )
  const blockMessage =
    result.block_reason ??
    blockingWarning?.message ??
    'Requested hosts exceed available capacity.'
  const blockField =
    (blockingWarning && getFieldForValidationRule(blockingWarning.rule)) ??
    getFieldForBlockReason(blockMessage)

  if (!blockField) {
    return {
      fieldFeedback,
      genericBlockMessage: blockMessage,
    }
  }

  return {
    fieldFeedback: {
      ...fieldFeedback,
      [blockField]: {
        messages: [blockMessage],
        severity: 'block',
      },
    },
    genericBlockMessage: null,
  }
}

function getClientDateValidationFeedback(
  formData: FormData
): FieldValidationFeedback {
  let feedback: FieldValidationFeedback = {}
  const startDate = (formData.get('start_date') ?? '').toString().trim()
  const endDate = (formData.get('end_date') ?? '').toString().trim()

  if (startDate && startDate <= getTodayInputValue()) {
    feedback = addValidationFeedback(
      feedback,
      'start_date',
      START_DATE_FUTURE_MESSAGE,
      'block'
    )
  }

  if (startDate && endDate && startDate > endDate) {
    feedback = addValidationFeedback(
      feedback,
      'end_date',
      START_DATE_BEFORE_END_DATE_MESSAGE,
      'block'
    )
  }

  return feedback
}

function getCreateErrorValidationFeedback(
  error: string | null
): FieldValidationFeedback {
  if (error === START_DATE_FUTURE_MESSAGE) {
    return {
      start_date: {
        messages: [error],
        severity: 'block',
      },
    }
  }

  if (error === START_DATE_BEFORE_END_DATE_MESSAGE) {
    return {
      end_date: {
        messages: [error],
        severity: 'block',
      },
    }
  }

  return {}
}

function hasUnsavedFormChanges(
  currentValues: BookingFormValues,
  initialValues: BookingFormValues
): boolean {
  return (Object.keys(currentValues) as BookingFormValueName[]).some(
    (field) => currentValues[field] !== initialValues[field]
  )
}

export function BookingForm({
  gpuHostTypes,
  workflowTypes,
  initialStartDate,
  initialEndDate,
}: BookingFormProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    createBooking,
    initialBookingFormState
  )
  const [fieldErrors, setFieldErrors] = useState(state.fieldErrors)
  const [validationResult, setValidationResult] =
    useState<BookingValidation | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [clientValidationFeedback, setClientValidationFeedback] =
    useState<FieldValidationFeedback>({})
  const [availabilityState, setAvailabilityState] =
    useState<AvailabilityState | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  )
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [validating, setValidating] = useState(false)
  const validationRequestIdRef = useRef(0)
  const activeValidationRequestIdRef = useRef<number | null>(null)
  const availabilityRequestIdRef = useRef(0)
  const scrollRestoreRef = useRef<{ left: number; top: number } | null>(null)
  const warningSummaryRef = useRef<HTMLDivElement | null>(null)
  const initialFormValuesRef = useRef<BookingFormValues | null>(null)
  const [formValues, setFormValues] = useState<BookingFormValues>(() => {
    const initialValues = buildFormValues(
      state.values,
      initialStartDate,
      initialEndDate
    )

    initialFormValuesRef.current = initialValues

    return initialValues
  })

  const { fieldFeedback: validationResultFieldFeedback, genericBlockMessage } =
    getValidationFeedback(validationResult)
  const fieldValidationFeedback = mergeValidationFeedback(
    validationResultFieldFeedback,
    clientValidationFeedback
  )
  const availabilityRangeKey = getAvailabilityRangeKey(
    formValues.start_date,
    formValues.end_date
  )
  const availabilityAppliesToRange =
    availabilityState !== null &&
    availabilityState.rangeKey === availabilityRangeKey
  const hostTypeAvailabilityById = useMemo(
    () =>
      new Map(
        availabilityAppliesToRange
          ? availabilityState.items.map((item) => [item.gpu_host_type_id, item])
          : []
      ),
    [availabilityAppliesToRange, availabilityState]
  )
  const selectableGpuHostTypes = useMemo(
    () => gpuHostTypes.filter((gpuHostType) => gpuHostType.total_count > 0),
    [gpuHostTypes]
  )
  const selectedGpuHostTypeId = getHostTypeId(formValues.gpu_host_type_id)
  const selectedGpuHostType =
    selectedGpuHostTypeId === null
      ? null
      : (selectableGpuHostTypes.find(
          (gpuHostType) => gpuHostType.id === selectedGpuHostTypeId
        ) ?? null)

  const getHostTypeBookableLimit = useCallback(
    (gpuHostType: GpuHostType): number => {
      const availability = hostTypeAvailabilityById.get(gpuHostType.id)
      if (availability) {
        return Math.min(
          gpuHostType.total_count,
          availability.currently_bookable
        )
      }

      return gpuHostType.total_count
    },
    [hostTypeAvailabilityById]
  )

  const selectedHostCountMax = selectedGpuHostType
    ? getHostTypeBookableLimit(selectedGpuHostType)
    : 0
  const isHostCountDisabled =
    pending || selectedGpuHostType === null || selectedHostCountMax <= 0

  function hasBlockingValidation(field: BookingFieldName): boolean {
    return fieldValidationFeedback[field]?.severity === 'block'
  }

  function scheduleScrollRestore() {
    if (typeof window === 'undefined') {
      return
    }

    scrollRestoreRef.current = {
      left: window.scrollX,
      top: window.scrollY,
    }
  }

  function renderValidationFeedback(field: BookingFieldName) {
    const feedback = fieldValidationFeedback[field]

    if (!feedback) {
      return null
    }

    if (feedback.severity === 'block') {
      return (
        <p
          className="text-destructive border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm"
          data-validation-severity={feedback.severity}
          role="alert"
        >
          {feedback.messages[0]}
        </p>
      )
    }

    return (
      <div
        className="bg-secondary text-secondary-foreground rounded-md border px-3 py-2 text-sm"
        data-validation-severity={feedback.severity}
        role="status"
      >
        {feedback.messages.length === 1 ? (
          <p>{feedback.messages[0]}</p>
        ) : (
          <ul className="space-y-2">
            {feedback.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  function clearValidationState() {
    setValidationResult(null)
    setValidationError(null)
    setClientValidationFeedback({})
    setAwaitingConfirmation(false)
  }

  function cancelValidationRequest() {
    activeValidationRequestIdRef.current = null
    setValidating(false)
  }

  function beginValidationRequest() {
    const requestId = validationRequestIdRef.current + 1
    validationRequestIdRef.current = requestId
    activeValidationRequestIdRef.current = requestId
    setValidating(true)

    return requestId
  }

  function isActiveValidationRequest(requestId: number) {
    return activeValidationRequestIdRef.current === requestId
  }

  function handleFieldChange(
    field: BookingFormValueName
  ): (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void {
    return (event) => {
      const nextValue = event.target.value
      if (activeValidationRequestIdRef.current !== null) {
        cancelValidationRequest()
      }

      if (
        validationResult !== null ||
        validationError !== null ||
        Object.keys(clientValidationFeedback).length > 0 ||
        awaitingConfirmation
      ) {
        clearValidationState()
      }

      if (field === 'host_count') {
        setFormValues((current) => ({
          ...current,
          host_count: constrainHostCountValue(nextValue, selectedHostCountMax),
        }))
        return
      }

      if (field === 'gpu_host_type_id') {
        const nextGpuHostTypeId = getHostTypeId(nextValue)
        const nextGpuHostType =
          nextGpuHostTypeId === null
            ? null
            : (selectableGpuHostTypes.find(
                (gpuHostType) => gpuHostType.id === nextGpuHostTypeId
              ) ?? null)
        const nextHostCountMax = nextGpuHostType
          ? getHostTypeBookableLimit(nextGpuHostType)
          : 0

        setFormValues((current) => ({
          ...current,
          gpu_host_type_id: nextValue,
          host_count: constrainHostCountValue(
            current.host_count,
            nextHostCountMax
          ),
        }))
        return
      }

      setFormValues((current) => ({
        ...current,
        [field]: nextValue,
      }))
    }
  }

  useLayoutEffect(() => {
    if (!scrollRestoreRef.current) {
      return
    }

    const scrollRestore = scrollRestoreRef.current
    scrollRestoreRef.current = null

    window.scrollTo({
      left: scrollRestore.left,
      top: scrollRestore.top,
    })
  }, [
    awaitingConfirmation,
    clientValidationFeedback,
    validationError,
    validationResult,
  ])

  useLayoutEffect(() => {
    if (
      !awaitingConfirmation ||
      !validationResult ||
      typeof window === 'undefined'
    ) {
      return
    }

    const warningSummary = warningSummaryRef.current

    if (!warningSummary) {
      return
    }

    const warningSummaryRect = warningSummary.getBoundingClientRect()
    const maxVisibleBottom =
      window.innerHeight - WARNING_SUMMARY_SCROLL_PADDING_PX

    if (warningSummaryRect.bottom <= maxVisibleBottom) {
      return
    }

    const nextTop =
      window.scrollY + (warningSummaryRect.bottom - maxVisibleBottom)

    if (nextTop <= window.scrollY) {
      return
    }

    window.scrollTo({
      left: window.scrollX,
      top: nextTop,
    })
  }, [awaitingConfirmation, validationResult])

  useEffect(() => {
    return () => {
      activeValidationRequestIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!availabilityRangeKey) {
      availabilityRequestIdRef.current += 1
      setAvailabilityState(null)
      setAvailabilityError(null)
      return
    }

    const requestId = availabilityRequestIdRef.current + 1
    availabilityRequestIdRef.current = requestId
    const [startDate, endDate] = availabilityRangeKey.split(':')
    setAvailabilityError(null)

    getHostTypeAvailability(startDate, endDate)
      .then((items) => {
        if (availabilityRequestIdRef.current !== requestId) {
          return
        }

        setAvailabilityState({
          rangeKey: availabilityRangeKey,
          items,
        })
      })
      .catch((error: unknown) => {
        if (availabilityRequestIdRef.current !== requestId) {
          return
        }

        setAvailabilityState(null)
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : 'Failed to load host availability.'
        )
      })
  }, [availabilityRangeKey])

  useEffect(() => {
    setFormValues((current) => {
      const currentHostTypeId = getHostTypeId(current.gpu_host_type_id)

      if (currentHostTypeId === null) {
        return current.host_count ? { ...current, host_count: '' } : current
      }

      const currentGpuHostType = selectableGpuHostTypes.find(
        (gpuHostType) => gpuHostType.id === currentHostTypeId
      )

      if (!currentGpuHostType) {
        return {
          ...current,
          gpu_host_type_id: '',
          host_count: '',
        }
      }

      const currentHostCountMax = getHostTypeBookableLimit(currentGpuHostType)

      if (currentHostCountMax <= 0) {
        return {
          ...current,
          gpu_host_type_id: '',
          host_count: '',
        }
      }

      const nextHostCount = constrainHostCountValue(
        current.host_count,
        currentHostCountMax
      )

      return nextHostCount === current.host_count
        ? current
        : {
            ...current,
            host_count: nextHostCount,
          }
    })
  }, [availabilityState, getHostTypeBookableLimit, selectableGpuHostTypes])

  useEffect(() => {
    if (!pending) {
      const nextValues = buildFormValues(
        state.values,
        initialStartDate,
        initialEndDate
      )

      setFormValues((current) => {
        for (const field of Object.keys(nextValues) as BookingFormValueName[]) {
          if (current[field] !== nextValues[field]) {
            return nextValues
          }
        }

        return current
      })
    }
  }, [initialEndDate, initialStartDate, pending, state.values])

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
      const createErrorValidationFeedback = getCreateErrorValidationFeedback(
        state.error
      )

      if (Object.keys(createErrorValidationFeedback).length > 0) {
        scheduleScrollRestore()
        setClientValidationFeedback(createErrorValidationFeedback)
        return
      }

      toast.error(state.error)
    }
  }, [router, state])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const nextFieldErrors = validateRequiredFields(formData)
    setFieldErrors(nextFieldErrors)

    if (Object.keys(nextFieldErrors).length > 0) {
      clearValidationState()
      return
    }

    const nextClientValidationFeedback =
      getClientDateValidationFeedback(formData)

    if (Object.keys(nextClientValidationFeedback).length > 0) {
      scheduleScrollRestore()
      setValidationResult(null)
      setValidationError(null)
      setClientValidationFeedback(nextClientValidationFeedback)
      setAwaitingConfirmation(false)
      return
    }

    if (awaitingConfirmation) {
      clearValidationState()
      startTransition(() => {
        formAction(formData)
      })
      return
    }

    setValidationResult(null)
    setValidationError(null)
    setAwaitingConfirmation(false)
    const requestId = beginValidationRequest()

    try {
      const response = await validateBooking(formData)

      if (!isActiveValidationRequest(requestId)) {
        return
      }

      if (response.blocked) {
        scheduleScrollRestore()
        setValidationResult(response)
        return
      }

      if (response.warnings.length > 0) {
        setValidationResult(response)
        setAwaitingConfirmation(true)
        return
      }

      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      if (!isActiveValidationRequest(requestId)) {
        return
      }

      setValidationResult(null)
      setAwaitingConfirmation(false)
      scheduleScrollRestore()
      setValidationError(
        error instanceof Error ? error.message : 'Failed to validate booking.'
      )
    } finally {
      if (isActiveValidationRequest(requestId)) {
        activeValidationRequestIdRef.current = null
        setValidating(false)
      }
    }
  }

  function handleClose() {
    const initialValues = initialFormValuesRef.current

    if (
      initialValues &&
      hasUnsavedFormChanges(formValues, initialValues) &&
      !window.confirm('Discard changes to this booking request?')
    ) {
      return
    }

    router.push('/bookings')
  }

  const actionLabel = pending
    ? 'Creating Booking…'
    : validating
      ? 'Validating…'
      : awaitingConfirmation
        ? 'Confirm'
        : 'Create Booking'

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Create Booking</CardTitle>
          <CardDescription>Request GPU hosts for your project.</CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close form"
          disabled={pending || validating}
          onClick={handleClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <fieldset
            disabled={pending}
            className="min-w-0 space-y-6 border-0 p-0"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="gpu_host_type_id"
                  className="text-sm font-medium"
                >
                  GPU Host Type
                </label>
                <select
                  id="gpu_host_type_id"
                  name="gpu_host_type_id"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  value={formValues.gpu_host_type_id}
                  onChange={handleFieldChange('gpu_host_type_id')}
                  aria-invalid={
                    Boolean(fieldErrors.gpu_host_type_id) ||
                    hasBlockingValidation('gpu_host_type_id')
                  }
                >
                  <option value="">Select GPU host type</option>
                  {selectableGpuHostTypes.map((gpuHostType) => {
                    const bookableLimit = getHostTypeBookableLimit(gpuHostType)
                    const isUnavailable = bookableLimit <= 0

                    return (
                      <option
                        key={gpuHostType.id}
                        value={gpuHostType.id}
                        disabled={isUnavailable}
                      >
                        {formatGpuHostTypeLabel(gpuHostType)}
                        {isUnavailable ? ' (none available)' : ''}
                      </option>
                    )
                  })}
                </select>
                {fieldErrors.gpu_host_type_id && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.gpu_host_type_id}
                  </p>
                )}
                {renderValidationFeedback('gpu_host_type_id')}
                {availabilityError && (
                  <p className="text-destructive text-sm" role="alert">
                    {availabilityError}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="host_count" className="text-sm font-medium">
                  Host Count
                </label>
                <Input
                  id="host_count"
                  name="host_count"
                  type="number"
                  min={1}
                  max={
                    selectedHostCountMax > 0 ? selectedHostCountMax : undefined
                  }
                  disabled={isHostCountDisabled}
                  value={formValues.host_count}
                  onChange={handleFieldChange('host_count')}
                  aria-invalid={
                    Boolean(fieldErrors.host_count) ||
                    hasBlockingValidation('host_count')
                  }
                />
                {fieldErrors.host_count && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.host_count}
                  </p>
                )}
                {renderValidationFeedback('host_count')}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="workflow_type_id"
                  className="text-sm font-medium"
                >
                  Workflow Type
                </label>
                <select
                  id="workflow_type_id"
                  name="workflow_type_id"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  value={formValues.workflow_type_id}
                  onChange={handleFieldChange('workflow_type_id')}
                  aria-invalid={
                    Boolean(fieldErrors.workflow_type_id) ||
                    hasBlockingValidation('workflow_type_id')
                  }
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
                {renderValidationFeedback('workflow_type_id')}
              </div>

              <div className="space-y-1">
                <label htmlFor="alt_email" className="text-sm font-medium">
                  Alternate Email
                </label>
                <Input
                  id="alt_email"
                  name="alt_email"
                  type="email"
                  value={formValues.alt_email}
                  onChange={handleFieldChange('alt_email')}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="start_date" className="text-sm font-medium">
                  Start Date
                </label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={formValues.start_date}
                  onChange={handleFieldChange('start_date')}
                  aria-invalid={
                    Boolean(fieldErrors.start_date) ||
                    hasBlockingValidation('start_date')
                  }
                />
                {fieldErrors.start_date && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.start_date}
                  </p>
                )}
                {renderValidationFeedback('start_date')}
              </div>

              <div className="space-y-1">
                <label htmlFor="end_date" className="text-sm font-medium">
                  End Date
                </label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={formValues.end_date}
                  onChange={handleFieldChange('end_date')}
                  aria-invalid={
                    Boolean(fieldErrors.end_date) ||
                    hasBlockingValidation('end_date')
                  }
                />
                {fieldErrors.end_date && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.end_date}
                  </p>
                )}
                {renderValidationFeedback('end_date')}
              </div>

              <div className="space-y-1">
                <label htmlFor="project_name" className="text-sm font-medium">
                  Project Name
                </label>
                <Input
                  id="project_name"
                  name="project_name"
                  type="text"
                  value={formValues.project_name}
                  onChange={handleFieldChange('project_name')}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="project_pi" className="text-sm font-medium">
                  PI/Lead
                </label>
                <Input
                  id="project_pi"
                  name="project_pi"
                  type="text"
                  value={formValues.project_pi}
                  onChange={handleFieldChange('project_pi')}
                />
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
                  value={formValues.project_grant_number}
                  onChange={handleFieldChange('project_grant_number')}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="technical_lead" className="text-sm font-medium">
                  Technical Lead
                </label>
                <Input
                  id="technical_lead"
                  name="technical_lead"
                  type="text"
                  value={formValues.technical_lead}
                  onChange={handleFieldChange('technical_lead')}
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="event_start_date"
                  className="text-sm font-medium"
                >
                  Event Start Date
                </label>
                <Input
                  id="event_start_date"
                  name="event_start_date"
                  type="date"
                  value={formValues.event_start_date}
                  onChange={handleFieldChange('event_start_date')}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="event_end_date" className="text-sm font-medium">
                  Event End Date
                </label>
                <Input
                  id="event_end_date"
                  name="event_end_date"
                  type="date"
                  value={formValues.event_end_date}
                  onChange={handleFieldChange('event_end_date')}
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending || validating}>
                {actionLabel}
              </Button>
            </div>

            {validationError && (
              <div className="text-destructive border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm">
                {validationError}
              </div>
            )}

            {genericBlockMessage && (
              <div
                className="text-destructive border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm"
                data-validation-severity="block"
                role="alert"
              >
                {genericBlockMessage}
              </div>
            )}

            {awaitingConfirmation && validationResult && (
              <div
                ref={warningSummaryRef}
                className="bg-secondary text-secondary-foreground rounded-md border p-3 text-sm"
              >
                <p className="font-medium">
                  Review warnings before confirming.
                </p>
                <ul className="mt-2 space-y-2">
                  {validationResult.warnings.map((warning) => (
                    <li key={`${warning.rule}-${warning.message}`}>
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
