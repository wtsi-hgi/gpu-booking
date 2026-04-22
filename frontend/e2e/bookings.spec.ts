import { expect, test } from '@playwright/test'

import {
  createBooking,
  dragAcrossDays,
  getBookingRow,
  getCurrentMonthInteractionDates,
  getDayCell,
  getFutureSubmissionDates,
  getIsoDateOffset,
  getTotalGpuCapacity,
  gotoPath,
  switchUser,
} from './helpers'

test.describe('bookings flows', () => {
  test('shows calendar filtering, table details, and user cancellation behaviour', async ({
    page,
    request,
  }) => {
    const dates = getCurrentMonthInteractionDates()
    const totalGpuCapacity = await getTotalGpuCapacity(
      request,
      'researcher@example.com'
    )
    const ownBooking = await createBooking(request, 'researcher@example.com', {
      altEmail: 'alt-e2e@example.com',
      endDate: dates.focusPlusOne,
      eventEndDate: dates.focusPlusOne,
      eventStartDate: dates.focus,
      gpuCount: 4,
      gpuTypeName: 'H100',
      projectName: 'PW E2E Own Booking',
      projectPi: 'Prof Playwright',
      startDate: dates.focus,
      technicalLead: 'Lead Playwright',
    })
    const otherBooking = await createBooking(request, 'other@example.com', {
      endDate: dates.focus,
      gpuCount: 3,
      gpuTypeName: 'H200',
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
      dayCell.getByText(`7 of ${totalGpuCapacity} GPUs`)
    ).toBeVisible()

    await page.locator('#gpu-filter').selectOption({ label: 'H100' })
    await expect(dayCell.getByText('4 of 16 GPUs')).toBeVisible()

    await page.locator('#gpu-filter').selectOption({ label: 'All GPU types' })

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
      getBookingRow(page, otherBooking.id).getByRole('button', { name: 'Cancel' })
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
    const totalGpuCapacity = await getTotalGpuCapacity(
      request,
      'researcher@example.com'
    )
    const proposedGpuCount = 2
    const warningSeedGpuCount = Math.max(
      1,
      Math.floor(totalGpuCapacity * 0.4) - proposedGpuCount + 1
    )
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

    await createBooking(request, 'researcher@example.com', {
      endDate: warningDates.end,
      gpuCount: warningSeedGpuCount,
      gpuTypeName: 'H200',
      projectName: 'PW E2E Existing Capacity Share',
      startDate: warningDates.start,
      workflowName: 'Interactive workloads',
    })

    await gotoPath(
      page,
      `/bookings/new?start=${warningDates.start}&end=${warningDates.end}`
    )
    await switchUser(page, 'researcher@example.com')

    await page.getByLabel('GPU Type').selectOption({ label: 'H100' })
  await page.getByLabel('GPU Count').fill(String(proposedGpuCount))
    await page.getByLabel('GRAM').selectOption({ label: '80GB' })
    await page.getByLabel('System Memory').selectOption({ label: '500GB' })
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Project Name').fill(projectName)
    await page.getByLabel('PI/Lead').fill('Dr Warning Path')
    await page.getByLabel('Technical Lead').fill('Warn Flow Lead')

    await page.getByRole('button', { name: 'Create Booking' }).click()

    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(
      page.getByText('Review warnings before confirming.')
    ).toBeVisible()
    await expect(
      page.getByRole('status').getByText(
        /Proposed booking exceeds 40% per-user capacity/i
      )
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
    await expect(page.getByLabel('Event Start Date', { exact: true })).toHaveValue(
      monthDates.focusPlusOne
    )
    await expect(page.getByLabel('Event End Date', { exact: true })).toHaveValue(
      monthDates.focusPlusOne
    )

    await gotoPath(page, '/bookings')

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
    await expect(page.getByLabel('Event Start Date', { exact: true })).toHaveValue(
      futureDates.start
    )
    await expect(page.getByLabel('Event End Date', { exact: true })).toHaveValue(
      futureDates.end
    )

    await page.getByLabel('GPU Type').selectOption({ label: 'H100' })
    await page.getByLabel('GPU Count').fill('2')
    await page.getByLabel('GRAM').selectOption({ label: '80GB' })
    await page.getByLabel('System Memory').selectOption({ label: '500GB' })
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Project Name').fill(projectName)
    await page.getByLabel('PI/Lead').fill('Dr Browser Regression')
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
})
