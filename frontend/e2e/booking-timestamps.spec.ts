import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  adminUpdateBooking,
  createBooking,
  getBookingRow,
  gotoPath,
} from './helpers'

test.use({
  timezoneId: 'America/New_York',
  viewport: { width: 1440, height: 1000 },
})

const screenshotPath = path.resolve(
  __dirname,
  '../../.tmp/agent/booking-timestamps.png'
)
function expectedUtcDisplay(value: string): string {
  return new Date(`${value}Z`)
    .toUTCString()
    .replace(/^\w+, (.*) (\d{2}:\d{2}):\d{2} GMT$/, '$1, $2')
}

test('renders backend UTC timestamps without hydration errors in a non-UTC browser', async ({
  page,
  request,
}) => {
  const created = await createBooking(request, 'timestamp@example.com', {
    startDate: '2028-06-12',
    endDate: '2028-06-13',
    projectName: 'PW UTC timestamp regression',
  })
  const booking = await adminUpdateBooking(request, created, {
    admin_notes: 'UTC timestamp fixture',
  })
  expect(booking.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+$/)
  expect(booking.admin_modified_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+$/)
  const expectedCreated = expectedUtcDisplay(booking.created_at)
  const expectedModified = expectedUtcDisplay(booking.admin_modified_at!)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.context().addCookies([
    {
      domain: '127.0.0.1',
      name: 'gpu_booking_dev_user_email',
      path: '/',
      sameSite: 'Lax',
      value: 'admin@example.com',
    },
  ])
  // A document navigation exercises server rendering and client hydration.
  await gotoPath(page, '/admin/bookings')
  await page.getByLabel('Search').fill('PW UTC timestamp regression')
  const row = getBookingRow(page, booking.id)
  await expect(row).toBeVisible()
  await mkdir(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath })

  expect
    .soft(pageErrors, 'Server and browser must hydrate the same UTC timestamps')
    .toEqual([])
  await expect.soft(row.locator('td').nth(8)).toHaveText(expectedCreated)
  await expect.soft(row.locator('td').nth(11)).toHaveText(expectedModified)
  await row.click()
  await expect
    .soft(page.getByTestId('admin-booking-side-panel'))
    .toContainText(`Last Modified At: ${expectedModified}`)
})
