import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

type ApiHeaders = Record<string, string>

type ReferenceItem = {
  id: number
  name?: string
  label?: string
  total_count?: number
}

type Catalog = {
  gpuTypes: ReferenceItem[]
  workflowTypes: ReferenceItem[]
  gramOptions: ReferenceItem[]
  memoryOptions: ReferenceItem[]
}

export type BookingRecord = {
  id: number
  user_email: string
  gpu_type_id: number
  gpu_type_name: string
  gpu_count: number
  gram_option_id: number
  gram_label: string
  memory_option_id: number
  memory_label: string
  workflow_type_id: number
  workflow_type_name: string
  start_date: string
  end_date: string
  status: 'unconfirmed' | 'confirmed' | 'tentative' | 'spot' | 'rejected' | 'cancelled'
  alt_email: string | null
  project_name: string | null
  project_pi: string | null
  project_grant_number: string | null
  technical_lead: string | null
  event_start_date: string | null
  event_end_date: string | null
  admin_notes: string | null
  admin_modified_by: string | null
  admin_modified_at: string | null
  created_at: string
  updated_at: string
  warnings: string[]
}

type CreateBookingOverrides = {
  altEmail?: string | null
  endDate?: string
  eventEndDate?: string | null
  eventStartDate?: string | null
  gpuCount?: number
  gpuTypeName?: string
  memoryLabel?: string
  gramLabel?: string
  projectGrantNumber?: string | null
  projectName?: string | null
  projectPi?: string | null
  startDate?: string
  technicalLead?: string | null
  workflowName?: string
}

type AdminUpdateOverrides = {
  admin_notes?: string | null
  alt_email?: string | null
  end_date?: string
  event_end_date?: string | null
  event_start_date?: string | null
  gpu_count?: number
  gpu_type_id?: number
  gram_option_id?: number
  memory_option_id?: number
  project_grant_number?: string | null
  project_name?: string | null
  project_pi?: string | null
  start_date?: string
  status?: BookingRecord['status']
  technical_lead?: string | null
  workflow_type_id?: number
}

const backendBaseUrl =
  process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8100'

const DEV_USER_COOKIE_NAME = 'gpu_booking_dev_user_email'

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

export async function gotoPath(page: Page, path: string) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.goto(path)
      return
    } catch (error) {
      lastError = error
      if (!String(error).includes('ERR_CONNECTION_REFUSED')) {
        throw error
      }
      await delay(500)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to open ${path}`)
}

function atUtcMidnight(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  )
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getInclusiveIsoDateRange(startIso: string, endIso: string): string[] {
  const direction = startIso <= endIso ? 1 : -1
  const dates: string[] = []
  let current = `${startIso}T00:00:00Z`

  while (true) {
    const currentDate = new Date(current)
    const currentIso = toIsoDate(currentDate)
    dates.push(currentIso)

    if (currentIso === endIso) {
      return dates
    }

    current = addDays(currentDate, direction).toISOString()
  }
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function getIsoDateOffset(days: number): string {
  return toIsoDate(addDays(atUtcMidnight(new Date()), days))
}

export function getCurrentMonthInteractionDates() {
  const today = atUtcMidnight(new Date())
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const monthEnd = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const anchorDay = Math.min(Math.max(today.getUTCDate() + 1, 8), monthEnd - 4)
  const anchor = new Date(Date.UTC(year, month, anchorDay))

  return {
    focus: toIsoDate(anchor),
    focusPlusOne: toIsoDate(addDays(anchor, 1)),
    focusPlusTwo: toIsoDate(addDays(anchor, 2)),
    focusPlusFour: toIsoDate(addDays(anchor, 4)),
  }
}

export function getFutureSubmissionDates() {
  const start = addDays(atUtcMidnight(new Date()), 21)
  const end = addDays(start, 2)
  const today = atUtcMidnight(new Date())
  const monthDelta =
    (start.getUTCFullYear() - today.getUTCFullYear()) * 12 +
    (start.getUTCMonth() - today.getUTCMonth())

  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    monthDelta,
  }
}

export function getBookingRow(page: Page, bookingId: number): Locator {
  return page.locator(`[data-booking-id="${bookingId}"]`)
}

export function getDayCell(page: Page, dateIso: string): Locator {
  return page.locator(
    `[data-day-cell="true"][data-date="${dateIso}"]`
  ).first()
}

function authHeaders(email: string): ApiHeaders {
  return { 'X-Dev-User': email }
}

async function readJson<T>(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const body = await response.text()
  expect(response.ok(), body).toBeTruthy()
  return JSON.parse(body) as T
}

async function waitForBackend(request: APIRequestContext) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request.get(`${backendBaseUrl}/api/v1/health`)
      if (response.ok()) {
        return
      }
      lastError = await response.text()
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw new Error(`Backend did not become ready: ${String(lastError)}`)
}

async function getCatalog(request: APIRequestContext, email: string): Promise<Catalog> {
  const headers = authHeaders(email)
  const [gpuTypesResponse, workflowTypesResponse, gramOptionsResponse, memoryOptionsResponse] =
    await Promise.all([
      request.get(`${backendBaseUrl}/api/v1/gpu-types`, { headers }),
      request.get(`${backendBaseUrl}/api/v1/workflow-types`, { headers }),
      request.get(`${backendBaseUrl}/api/v1/gram-options`, { headers }),
      request.get(`${backendBaseUrl}/api/v1/memory-options`, { headers }),
    ])

  const [gpuTypes, workflowTypes, gramOptions, memoryOptions] = await Promise.all([
    readJson<ReferenceItem[]>(gpuTypesResponse),
    readJson<ReferenceItem[]>(workflowTypesResponse),
    readJson<ReferenceItem[]>(gramOptionsResponse),
    readJson<ReferenceItem[]>(memoryOptionsResponse),
  ])

  return {
    gpuTypes,
    workflowTypes,
    gramOptions,
    memoryOptions,
  }
}

export async function getTotalGpuCapacity(
  request: APIRequestContext,
  email: string
): Promise<number> {
  const catalog = await getCatalog(request, email)

  return catalog.gpuTypes.reduce(
    (total, gpuType) => total + (gpuType.total_count ?? 0),
    0
  )
}

function requireNamedItem(items: ReferenceItem[], key: 'name' | 'label', value: string): ReferenceItem {
  const item = items.find((entry) => entry[key] === value)
  if (!item) {
    throw new Error(`Missing ${key}=${value} in reference data`)
  }
  return item
}

export async function createBooking(
  request: APIRequestContext,
  email: string,
  overrides: CreateBookingOverrides = {}
): Promise<BookingRecord> {
  await waitForBackend(request)
  const catalog = await getCatalog(request, email)
  const gpuType = requireNamedItem(
    catalog.gpuTypes,
    'name',
    overrides.gpuTypeName ?? 'H100'
  )
  const workflowType = requireNamedItem(
    catalog.workflowTypes,
    'name',
    overrides.workflowName ?? 'Inference workloads'
  )
  const gramOption = requireNamedItem(
    catalog.gramOptions,
    'label',
    overrides.gramLabel ?? '80GB'
  )
  const memoryOption = requireNamedItem(
    catalog.memoryOptions,
    'label',
    overrides.memoryLabel ?? '500GB'
  )

  const payload = {
    gpu_type_id: gpuType.id,
    gpu_count: overrides.gpuCount ?? 1,
    gram_option_id: gramOption.id,
    memory_option_id: memoryOption.id,
    workflow_type_id: workflowType.id,
    start_date: overrides.startDate ?? getIsoDateOffset(5),
    end_date: overrides.endDate ?? getIsoDateOffset(6),
    alt_email: overrides.altEmail ?? null,
    project_name: overrides.projectName ?? null,
    project_pi: overrides.projectPi ?? null,
    project_grant_number: overrides.projectGrantNumber ?? null,
    technical_lead: overrides.technicalLead ?? null,
    event_start_date: overrides.eventStartDate ?? null,
    event_end_date: overrides.eventEndDate ?? null,
  }

  const response = await request.post(`${backendBaseUrl}/api/v1/bookings`, {
    data: payload,
    headers: authHeaders(email),
  })

  return readJson<BookingRecord>(response)
}

function buildAdminPayload(
  booking: BookingRecord,
  overrides: AdminUpdateOverrides = {}
) {
  return {
    status: overrides.status ?? booking.status,
    admin_notes: overrides.admin_notes ?? booking.admin_notes,
    gpu_type_id: overrides.gpu_type_id ?? booking.gpu_type_id,
    gpu_count: overrides.gpu_count ?? booking.gpu_count,
    gram_option_id: overrides.gram_option_id ?? booking.gram_option_id,
    memory_option_id: overrides.memory_option_id ?? booking.memory_option_id,
    workflow_type_id: overrides.workflow_type_id ?? booking.workflow_type_id,
    start_date: overrides.start_date ?? booking.start_date,
    end_date: overrides.end_date ?? booking.end_date,
    alt_email: overrides.alt_email ?? booking.alt_email,
    project_name: overrides.project_name ?? booking.project_name,
    project_pi: overrides.project_pi ?? booking.project_pi,
    project_grant_number:
      overrides.project_grant_number ?? booking.project_grant_number,
    technical_lead: overrides.technical_lead ?? booking.technical_lead,
    event_start_date: overrides.event_start_date ?? booking.event_start_date,
    event_end_date: overrides.event_end_date ?? booking.event_end_date,
  }
}

export async function adminUpdateBooking(
  request: APIRequestContext,
  booking: BookingRecord,
  overrides: AdminUpdateOverrides = {}
): Promise<BookingRecord> {
  await waitForBackend(request)
  const response = await request.patch(
    `${backendBaseUrl}/api/v1/admin/bookings/${booking.id}`,
    {
      data: buildAdminPayload(booking, overrides),
      headers: authHeaders('admin@example.com'),
    }
  )

  return readJson<BookingRecord>(response)
}

export async function adminUpdateBookingExpectingFailure(
  request: APIRequestContext,
  booking: BookingRecord,
  overrides: AdminUpdateOverrides = {}
) {
  await waitForBackend(request)
  const response = await request.patch(
    `${backendBaseUrl}/api/v1/admin/bookings/${booking.id}`,
    {
      data: buildAdminPayload(booking, overrides),
      headers: authHeaders('admin@example.com'),
    }
  )

  return {
    body: await response.text(),
    ok: response.ok(),
    status: response.status(),
  }
}

export async function switchUser(page: Page, email: string, expectAdmin = false) {
  const input = page.getByLabel('Impersonate user')

  await page.context().addCookies([
    {
      domain: '127.0.0.1',
      name: DEV_USER_COOKIE_NAME,
      path: '/',
      sameSite: 'Lax',
      value: email,
    },
  ])
  await page.reload()

  await expect(input).toBeVisible()
  await expect(input).toHaveValue(email)

  const adminNavigationLink = page.getByRole('link', {
    name: /^(Admin Dashboard|Bookings)$/,
  })

  if (expectAdmin) {
    await expect(adminNavigationLink).toBeVisible()
    return
  }

  await expect(adminNavigationLink).toHaveCount(0)
}

export async function dragAcrossDays(
  page: Page,
  startCell: Locator,
  endCell: Locator
) {
  const startDate = await startCell.getAttribute('data-date')
  const endDate = await endCell.getAttribute('data-date')

  if (!startDate || !endDate) {
    throw new Error('Missing calendar cell dates for drag interaction')
  }

  await startCell.hover()
  await page.mouse.down()

  for (const dateIso of getInclusiveIsoDateRange(startDate, endDate).slice(1)) {
    const cell = getDayCell(page, dateIso)
    await cell.hover()
  }

  await page.mouse.up()
}