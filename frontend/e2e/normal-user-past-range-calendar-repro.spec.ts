import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  dragAcrossDays,
  getDayCell,
  getIsoDateOffset,
  gotoPath,
  switchUser,
} from './helpers'

const repoRoot = path.resolve(__dirname, '..', '..')
const screenshotPath = path.join(
  repoRoot,
  '.tmp',
  'agent',
  'normal-user-past-range-calendar-cta-fixed.png'
)

test('greys out the calendar CTA for a normal user selecting a range with past dates', async ({
  page,
}) => {
  const pastStartDate = getIsoDateOffset(-2)
  const pastEndDate = getIsoDateOffset(-1)

  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoPath(page, '/bookings')
  await switchUser(page, 'researcher@example.com')

  let pastStartCell = getDayCell(page, pastStartDate)

  if ((await pastStartCell.count()) === 0) {
    await page.getByRole('button', { name: 'Previous month' }).click()
    pastStartCell = getDayCell(page, pastStartDate)
  }

  const pastEndCell = getDayCell(page, pastEndDate)
  await expect(pastStartCell).toBeVisible()
  await expect(pastEndCell).toBeVisible()

  await dragAcrossDays(page, pastStartCell, pastEndCell)

  const selectionPanel = page.locator('[data-selection-panel="true"]')
  await expect(selectionPanel).toHaveAttribute(
    'data-selection-start',
    pastStartDate
  )
  await expect(selectionPanel).toHaveAttribute(
    'data-selection-end',
    pastEndDate
  )

  const createButton = selectionPanel.getByRole('button', {
    name: /^Create Booking$/,
  })
  await expect(createButton).toBeVisible()
  await expect(createButton).toHaveText('Create Booking')
  await expect(createButton).toBeDisabled()
  await expect(createButton).toHaveCSS('opacity', '0.5')
  await expect(createButton).toHaveCSS('pointer-events', 'none')

  mkdirSync(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ fullPage: true, path: screenshotPath })

  const bookingsUrl = page.url()
  await createButton.evaluate((element) => {
    ;(element as HTMLButtonElement).click()
  })
  await expect(page).toHaveURL(bookingsUrl)
})
