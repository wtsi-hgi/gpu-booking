import { expect, test } from '@playwright/test'

import { gotoPath } from './helpers'

test('calendar weeks begin on Monday with dates aligned to headings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gotoPath(page, '/bookings')
  const grid = page.locator('[data-calendar-grid="true"]')
  await expect(grid).toBeVisible()
  await page.screenshot({ path: '../.tmp/agent/calendar-week-start.png' })
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
})
