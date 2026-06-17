import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test'

import {
  adminUpdateBooking,
  createBooking,
  dragAcrossDays,
  getBookingRow,
  getCurrentMonthInteractionDates,
  getDayCell,
  getFutureSubmissionDates,
  getIsoDateOffset,
  getTotalHostCapacity,
  gotoPath,
  switchUser,
} from './helpers'

type GpuHostTypeReference = {
  id: number
  gpu_type: string
  gpu_count: number
  total_count: number
}

const backendBaseUrl =
  process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8100'

async function readJson<T>(response: APIResponse): Promise<T> {
  const body = await response.text()
  expect(response.ok(), body).toBeTruthy()
  return JSON.parse(body) as T
}

async function createOneHostGpuType(
  request: APIRequestContext,
  gpuType: string
): Promise<GpuHostTypeReference> {
  const response = await request.post(
    `${backendBaseUrl}/api/v1/admin/gpu-host-types`,
    {
      data: {
        gpu_count: 8,
        gpu_type: gpuType,
        total_count: 1,
      },
      headers: { 'X-Dev-User': 'admin@example.com' },
    }
  )

  return readJson<GpuHostTypeReference>(response)
}

test.describe('bookings flows', () => {
  test('shows calendar filtering, table details, and user cancellation behaviour', async ({
    page,
    request,
  }) => {
    const dates = getCurrentMonthInteractionDates()
    const totalHostCapacity = await getTotalHostCapacity(
      request,
      'researcher@example.com'
    )
    const ownBooking = await createBooking(request, 'researcher@example.com', {
      altEmail: 'alt-e2e@example.com',
      endDate: dates.focusPlusOne,
      eventEndDate: dates.focusPlusOne,
      eventStartDate: dates.focus,
      gpuType: 'H100',
      hostCount: 1,
      projectName: 'PW E2E Own Booking',
      projectPi: 'Prof Playwright',
      startDate: dates.focus,
      technicalLead: 'Lead Playwright',
    })
    const otherBooking = await createBooking(request, 'other@example.com', {
      endDate: dates.focus,
      gpuType: 'H200',
      hostCount: 1,
      projectName: 'PW E2E Other Booking',
      startDate: dates.focus,
      workflowName: 'Interactive workloads',
    })

    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    const dayCell = getDayCell(page, dates.focus)

    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible()
    await expect(dayCell).toBeVisible()
    await expect(
      dayCell.getByText(`2 of ${totalHostCapacity} hosts`)
    ).toBeVisible()

    await page
      .locator('#gpu-host-type-filter')
      .selectOption({ label: '8 GPU H100' })
    await expect(dayCell.getByText('1 of 2 hosts')).toBeVisible()

    await page
      .locator('#gpu-host-type-filter')
      .selectOption({ label: 'All GPU host types' })

    await page.getByRole('tab', { name: 'Table' }).click()

    const searchInput = page.getByLabel('Search')

    await searchInput.fill('PW E2E Own Booking')
    await expect(getBookingRow(page, ownBooking.id)).toBeVisible()

    await getBookingRow(page, ownBooking.id).click()

    const detailRow = page.locator(
      `[data-booking-detail-id="${ownBooking.id}"]`
    )

    await expect(detailRow.getByText('Prof Playwright')).toBeVisible()
    await expect(detailRow.getByText('Lead Playwright')).toBeVisible()
    await expect(detailRow.getByText('alt-e2e@example.com')).toBeVisible()
    await expect(
      getBookingRow(page, ownBooking.id).getByRole('button', { name: 'Cancel' })
    ).toBeVisible()

    await searchInput.fill('PW E2E Other Booking')
    await expect(getBookingRow(page, otherBooking.id)).toBeVisible()
    await expect(
      getBookingRow(page, otherBooking.id).getByRole('button', {
        name: 'Cancel',
      })
    ).toHaveCount(0)

    await searchInput.fill('PW E2E Own Booking')
    page.once('dialog', (dialog) => dialog.accept())
    await getBookingRow(page, ownBooking.id)
      .getByRole('button', { name: 'Cancel' })
      .click()
    await expect(getBookingRow(page, ownBooking.id)).toHaveCount(0)
  })

  test('shows booking warnings before confirmation and submits after confirm', async ({
    page,
    request,
  }) => {
    const proposedHostCount = 1
    const warningDates = {
      start: getIsoDateOffset(25),
      end: getIsoDateOffset(27),
    }
    const warningStart = new Date(`${warningDates.start}T00:00:00Z`)
    const today = new Date()
    const monthDelta =
      (warningStart.getUTCFullYear() - today.getUTCFullYear()) * 12 +
      (warningStart.getUTCMonth() - today.getUTCMonth())
    const projectName = `PW E2E Warning ${warningDates.start}`

    for (let index = 0; index < 4; index += 1) {
      await createBooking(request, 'researcher@example.com', {
        endDate: warningDates.end,
        gpuType: 'H200',
        hostCount: 3,
        projectName: `PW E2E Existing Capacity Share ${index}`,
        startDate: warningDates.start,
        workflowName: 'Interactive workloads',
      })
    }

    await gotoPath(
      page,
      `/bookings/new?start=${warningDates.start}&end=${warningDates.end}`
    )
    await switchUser(page, 'researcher@example.com')

    await page.getByLabel('GPU Host Type').selectOption({ label: '8 GPU H100' })
    await page.getByLabel('Host Count').selectOption(String(proposedHostCount))
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Project Name').fill(projectName)
    await page.getByLabel('PI/Lead').fill('Dr Warning Path')
    await page.getByLabel('Cost Code').fill('CC-WARN-E2E')
    await page.getByLabel('Technical Lead').fill('Warn Flow Lead')

    await page.getByRole('button', { name: 'Create Booking' }).click()

    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(
      page.getByText('Review warnings before confirming.')
    ).toBeVisible()
    await expect(
      page
        .getByRole('status')
        .getByText(/Proposed booking exceeds 40% per-user host capacity/i)
    ).toBeVisible()

    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page).toHaveURL(/\/bookings$/)

    for (let step = 0; step < monthDelta; step += 1) {
      await page.getByRole('button', { name: 'Next month' }).click()
    }

    await page.getByRole('tab', { name: 'Table' }).click()
    await page.getByLabel('Search').fill(projectName)
    await expect(page.locator('[data-booking-row="true"]')).toHaveCount(1)
    await expect(page.locator('[data-booking-row="true"]')).toContainText(
      projectName
    )
  })

  test('opens booking forms from calendar interactions and submits a new booking', async ({
    page,
  }) => {
    const monthDates = getCurrentMonthInteractionDates()
    const futureDates = getFutureSubmissionDates()
    const projectName = `PW E2E Created ${futureDates.start}`

    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    await getDayCell(page, monthDates.focusPlusOne).dblclick()
    await expect(page).toHaveURL(
      new RegExp(
        `/bookings/new\\?start=${monthDates.focusPlusOne}&end=${monthDates.focusPlusOne}`
      )
    )
    await expect(page.getByLabel('Start Date', { exact: true })).toHaveValue(
      monthDates.focusPlusOne
    )
    await expect(page.getByLabel('End Date', { exact: true })).toHaveValue(
      monthDates.focusPlusOne
    )
    await expect(
      page.getByLabel('Event Start Date', { exact: true })
    ).toHaveValue(monthDates.focusPlusOne)
    await expect(
      page.getByLabel('Event End Date', { exact: true })
    ).toHaveValue(monthDates.focusPlusOne)
    await expect(page.getByLabel('GPU Host Type')).toHaveValue('')

    await gotoPath(page, '/bookings')
    const gpuHostTypeFilter = page.locator('#gpu-host-type-filter')
    await gpuHostTypeFilter.selectOption({ label: '8 GPU H100' })
    const selectedGpuHostTypeId = await gpuHostTypeFilter.inputValue()

    const dragStartCell = getDayCell(page, monthDates.focusPlusOne)
    const dragEndCell = getDayCell(page, monthDates.focusPlusFour)

    await dragAcrossDays(page, dragStartCell, dragEndCell)
    await expect(page.locator('[data-selection-panel="true"]')).toHaveAttribute(
      'data-selection-start',
      monthDates.focusPlusOne
    )
    await expect(page.locator('[data-selection-panel="true"]')).toHaveAttribute(
      'data-selection-end',
      monthDates.focusPlusFour
    )

    await page
      .getByRole('button', { name: /create booking for selection/i })
      .click()
    await expect(page).toHaveURL(
      new RegExp(
        `/bookings/new\\?start=${monthDates.focusPlusOne}&end=${monthDates.focusPlusFour}`
      )
    )
    await expect(page.getByLabel('GPU Host Type')).toHaveValue(
      selectedGpuHostTypeId
    )

    await gotoPath(
      page,
      `/bookings/new?start=${futureDates.start}&end=${futureDates.end}`
    )

    await expect(page.getByLabel('Start Date', { exact: true })).toHaveValue(
      futureDates.start
    )
    await expect(page.getByLabel('End Date', { exact: true })).toHaveValue(
      futureDates.end
    )
    await expect(
      page.getByLabel('Event Start Date', { exact: true })
    ).toHaveValue(futureDates.start)
    await expect(
      page.getByLabel('Event End Date', { exact: true })
    ).toHaveValue(futureDates.end)

    await page.getByLabel('GPU Host Type').selectOption({ label: '8 GPU H100' })
    await page.getByLabel('Host Count').selectOption('1')
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Project Name').fill(projectName)
    await page.getByLabel('PI/Lead').fill('Dr Browser Regression')
    await page.getByLabel('Cost Code').fill('CC-CREATE-E2E')
    await page.getByLabel('Technical Lead').fill('E2E Lead')
    await page.getByLabel('Alternate Email').fill('browser@example.com')
    await page.getByRole('button', { name: 'Create Booking' }).click()

    await expect(page).toHaveURL(/\/bookings$/)

    for (let step = 0; step < futureDates.monthDelta; step += 1) {
      await page.getByRole('button', { name: 'Next month' }).click()
    }

    await page.getByRole('tab', { name: 'Table' }).click()
    await page.getByLabel('Search').fill(projectName)
    await expect(page.locator('[data-booking-row="true"]')).toHaveCount(1)
    await expect(page.locator('[data-booking-row="true"]')).toContainText(
      projectName
    )
  })

  test('greys out the calendar selection CTA when confirmed bookings leave no hosts available', async ({
    page,
    request,
  }) => {
    const dates = getCurrentMonthInteractionDates()
    const selectedDate = dates.focusPlusTwo
    const uniqueGpuType = `PW CTA Zero ${Date.now()}`
    const gpuHostTypeLabel = `8 GPU ${uniqueGpuType}`
    await createOneHostGpuType(request, uniqueGpuType)
    const booking = await createBooking(request, 'holder@example.com', {
      endDate: selectedDate,
      gpuHostTypeLabel,
      hostCount: 1,
      projectGrantNumber: 'CC-ZERO-CTA',
      projectName: 'PW Zero Availability Calendar CTA',
      startDate: selectedDate,
    })

    await adminUpdateBooking(request, booking, {
      reservation_name: 'PW Zero Availability Hold',
      status: 'confirmed',
    })

    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')
    await page
      .locator('#gpu-host-type-filter')
      .selectOption({ label: gpuHostTypeLabel })

    const selectedDay = getDayCell(page, selectedDate)
    await expect(selectedDay).toContainText('1 of 1 hosts')
    await expect(selectedDay).toContainText('1 confirmed')
    await selectedDay.click()

    const selectionPanel = page.locator('[data-selection-panel="true"]')
    await expect(selectionPanel).toHaveAttribute(
      'data-selection-available',
      '0'
    )

    const createButton = selectionPanel.getByRole('button', {
      name: /create booking for selection/i,
    })
    await expect(createButton).toHaveText(
      'Create booking for selection (0 hosts available)'
    )
    await expect(createButton).toBeDisabled()
    await expect(createButton).toHaveCSS('opacity', '0.5')
    await expect(createButton).toHaveCSS('pointer-events', 'none')

    const bookingsUrl = page.url()
    await createButton.evaluate((element) => {
      ;(element as HTMLButtonElement).click()
    })
    await expect(page).toHaveURL(bookingsUrl)
  })
})
