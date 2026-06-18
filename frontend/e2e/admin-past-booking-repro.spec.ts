import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { getIsoDateOffset, gotoPath, switchUser } from './helpers'

const repoRoot = path.resolve(__dirname, '..', '..')
const screenshotPath = path.join(
  repoRoot,
  '.tmp',
  'agent',
  'admin-past-booking-fixed.png'
)
const backendBaseUrl =
  process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8100'

test('admin can create a booking that starts in the past', async ({
  page,
  request,
}) => {
  const pastStartDate = getIsoDateOffset(-2)
  const pastEndDate = getIsoDateOffset(-1)
  const projectName = `PW Admin Past Booking ${Date.now()}`

  await gotoPath(page, '/bookings/new')
  await switchUser(page, 'admin@example.com', true)

  await page.getByLabel('Start Date', { exact: true }).fill(pastStartDate)
  await page.getByLabel('End Date', { exact: true }).fill(pastEndDate)
  await page.getByLabel('GPU Host Type').selectOption({ label: '8 GPU H100' })
  await page.getByLabel('Host Count').selectOption('1')
  await page
    .getByLabel('Workflow Type')
    .selectOption({ label: 'Inference workloads' })
  await page.getByLabel('Project Name').fill(projectName)
  await page.getByLabel('PI/Lead').fill('Dr Admin Repro')
  await page.getByLabel('Cost Code').fill('CC-PAST-ADMIN')

  await page.getByRole('button', { name: 'Create Booking' }).click()

  await expect(page.getByText('Start date must be in the future')).toHaveCount(
    0
  )
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
  await expect(
    page.getByRole('status').getByText('Less than 2 weeks advance notice')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()

  await expect(page).toHaveURL(/\/bookings$/)
  await gotoPath(page, '/admin/bookings')
  await page.getByLabel('Search').fill(projectName)
  const bookingRow = page.locator('[data-booking-row="true"]')
  await expect(bookingRow).toHaveCount(1)
  await expect(bookingRow).toContainText(projectName)

  mkdirSync(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ fullPage: true, path: screenshotPath })

  const bookingId = await bookingRow.getAttribute('data-booking-id')
  if (!bookingId) {
    throw new Error('Created booking row did not expose a booking id')
  }

  const cleanupResponse = await request.delete(
    `${backendBaseUrl}/api/v1/bookings/${bookingId}`,
    {
      headers: { 'X-Dev-User': 'admin@example.com' },
    }
  )
  expect(cleanupResponse.ok(), await cleanupResponse.text()).toBeTruthy()
  const cleanupBody = (await cleanupResponse.json()) as { status: string }
  expect(cleanupBody.status).toBe('cancelled')
})
