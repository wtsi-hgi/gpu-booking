import { expect, test } from '@playwright/test'

import { getBookingRow, gotoPath, switchUser } from './helpers'

test('calendar weeks begin on Monday with dates aligned to headings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gotoPath(page, '/bookings')
  const grid = page.locator('[data-calendar-grid="true"]')
  await expect(grid).toBeVisible()
  const headers = grid.locator('..').locator('> div').first().locator('> div')
  await expect(headers).toHaveText([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ])
  const firstDate = await grid
    .locator('[data-day-cell="true"]')
    .first()
    .getAttribute('data-date')
  expect(new Date(`${firstDate}T00:00:00Z`).getUTCDay()).toBe(1)
  await page.screenshot({ path: '../.tmp/agent/calendar-week-start-after.png' })

  const cells = grid.locator('[data-day-cell="true"]')
  await expect(cells).toHaveCount(42)
  await cells.nth(35).hover()
  await page.mouse.down()
  await cells.nth(41).hover()
  await expect(cells).not.toHaveCount(42)
  await page.mouse.up()

  const dates = await cells.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-date'))
  )
  for (const [index, date] of dates.entries()) {
    const timestamp = new Date(`${date}T00:00:00Z`).getTime()
    expect(new Date(timestamp).getUTCDay()).toBe((index + 1) % 7)
    if (index > 0) {
      expect(
        timestamp - new Date(`${dates[index - 1]}T00:00:00Z`).getTime()
      ).toBe(86_400_000)
    }
  }
})

test.describe('booking duration', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('keeps booking days and dates in sync on the create form', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoPath(page, '/bookings/new?start=2028-02-28&end=2028-02-29')
    await expect(page.getByLabel('Start Date', { exact: true })).toHaveValue(
      '2028-02-28'
    )
    const days = page.getByLabel('Number of Days', { exact: true })
    const start = page.getByLabel('Start Date', { exact: true })
    const end = page.getByLabel('End Date', { exact: true })
    await expect(days).toHaveValue('2')
    await page.screenshot({ path: '../.tmp/agent/booking-days-after.png' })

    await days.fill('3')
    await expect(end).toHaveValue('2028-03-01')
    await end.fill('2028-02-28')
    await expect(days).toHaveValue('1')
    await start.fill('2028-02-27')
    await expect(days).toHaveValue('2')

    await start.fill('2028-12-31')
    await days.fill('2')
    await expect(end).toHaveValue('2029-01-01')
    await start.fill('2028-03-11')
    await days.fill('3')
    await expect(end).toHaveValue('2028-03-13')
    await end.fill('2028-03-12')
    await expect(days).toHaveValue('2')

    for (const invalid of ['', '0', '1.5', '999999999999999999999']) {
      await days.fill(invalid)
      await expect(end).toHaveValue('')
      await page.getByRole('button', { name: 'Create Booking' }).click()
      await expect(page).toHaveURL(/\/bookings\/new/)
    }
    await days.fill('3')
    await expect(end).toHaveValue('2028-03-13')
    await expect(
      page.getByLabel('Event Start Date', { exact: true })
    ).toHaveValue('2028-02-28')
    await expect(
      page.getByLabel('Event End Date', { exact: true })
    ).toHaveValue('2028-02-29')

    await page.getByLabel('GPU Host Type').selectOption({ label: '8 GPU H100' })
    await page.getByLabel('Host Count').selectOption('1')
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Cost Code').fill('CC-DURATION')
    await page.getByLabel('Project Name').fill('PW Duration Saved')
    await page.getByRole('button', { name: 'Create Booking' }).click()
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
    await expect
      .poll(
        async () =>
          new URL(page.url()).pathname === '/bookings' ||
          (await confirm.isVisible())
      )
      .toBe(true)
    if (await confirm.isVisible()) {
      await confirm.click()
    }
    await expect(page).toHaveURL(/\/bookings$/)

    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Duration Saved')
    const row = page.locator('[data-booking-row="true"]')
    await expect(row).toHaveCount(1)
    const bookingId = Number(await row.getAttribute('data-booking-id'))
    await row.click()
    const panel = page.getByTestId('admin-booking-side-panel')
    await expect(panel.getByLabel('End Date', { exact: true })).toHaveValue(
      '2028-03-13'
    )
    await expect(panel.getByLabel('Number of Days')).toHaveValue('3')
    await panel.getByLabel('Start Date', { exact: true }).fill('2028-12-31')
    await panel.getByLabel('Number of Days').fill('2')
    await expect(panel.getByLabel('End Date', { exact: true })).toHaveValue(
      '2029-01-01'
    )
    await panel.getByLabel('End Date', { exact: true }).fill('2029-01-02')
    await expect(panel.getByLabel('Number of Days')).toHaveValue('3')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel).toContainText('Last Modified By: admin@example.com')
    await page.reload()
    await page.getByLabel('Search').fill('PW Duration Saved')
    await getBookingRow(page, bookingId).click()
    await expect(panel.getByLabel('Start Date', { exact: true })).toHaveValue(
      '2028-12-31'
    )
    await expect(panel.getByLabel('End Date', { exact: true })).toHaveValue(
      '2029-01-02'
    )
    await expect(panel.getByLabel('Number of Days')).toHaveValue('3')
  })
})
