import { expect, test } from '@playwright/test'

import { gotoPath } from './helpers'

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
