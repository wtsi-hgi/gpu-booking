import path from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  adminUpdateBooking,
  createBooking,
  gotoPath,
  getBookingRow,
  getIsoDateOffset,
  switchUser,
} from './helpers'

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

const adminBookingDrawerToastPostfixScreenshotPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.tmp',
  'agent',
  'admin-booking-drawer-toast-close-postfix.png'
)

function getGpuHostTypeRow(page: Page, label: string): Locator {
  return page
    .locator('[data-gpu-host-row="true"]')
    .filter({ hasText: label })
    .first()
}

function getWorkflowTypeRow(page: Page, name: string): Locator {
  return page
    .locator('[data-workflow-row="true"]')
    .filter({ hasText: name })
    .first()
}

test.describe('admin flows', () => {
  test('shows admin dashboard navigation for bookings and reference data pages', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)

    await page.getByRole('link', { name: 'Admin Dashboard' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' })
    ).toBeVisible()
    await expect(page.getByText('0 pending bookings')).toBeVisible()
    await expect(
      page.getByRole('link', {
        name: /Manage Bookings.*0 pending bookings.*0 confirmed bookings this month/i,
      })
    ).toBeVisible()
    await expect(
      page.getByRole('link', {
        name: /GPU Host Types.*4 GPU host types configured/i,
      })
    ).toBeVisible()
    await expect(
      page.getByRole('link', {
        name: /Workflow Types.*4 workflow types configured/i,
      })
    ).toBeVisible()
    await expect(
      page.getByText('Pending Bookings', { exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByText('Confirmed This Month', { exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByText('GPU Host Types Configured', { exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Bookings', exact: true })
    ).toHaveAttribute('href', '/bookings')

    await page.getByRole('link', { name: /Manage Bookings/i }).click()
    await expect(page).toHaveURL(/\/admin\/bookings$/)
    await expect(
      page.getByRole('heading', { name: 'Manage Bookings' })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Admin Dashboard' })
    ).toHaveAttribute('href', '/admin')
    await page.getByRole('link', { name: 'Admin Dashboard' }).click()
    await expect(page).toHaveURL(/\/admin$/)

    await page.getByRole('link', { name: /GPU Host Types/i }).click()
    await expect(page).toHaveURL(/\/admin\/gpu-host-types$/)
    await expect(
      page.getByRole('heading', { name: 'Manage GPU Host Types' })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Admin Dashboard' })
    ).toHaveAttribute('href', '/admin')
    await page.getByRole('link', { name: 'Admin Dashboard' }).click()
    await expect(page).toHaveURL(/\/admin$/)

    await page.getByRole('link', { name: /Workflow Types/i }).click()
    await expect(page).toHaveURL(/\/admin\/workflow-types$/)
    await expect(
      page.getByRole('heading', { name: 'Manage Workflow Types' })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Admin Dashboard' })
    ).toHaveAttribute('href', '/admin')
    await page.getByRole('link', { name: 'Admin Dashboard' }).click()
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('navigates from the admin dashboard into booking management and updates a booking', async ({
    page,
    request,
  }) => {
    const booking = await createBooking(request, 'other@example.com', {
      endDate: getIsoDateOffset(7),
      hostCount: 1,
      projectName: 'PW Admin Update Booking',
      projectPi: 'Admin Test PI',
      startDate: getIsoDateOffset(6),
    })

    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)
    await expect(
      page.getByRole('link', { name: 'Admin Dashboard' })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Admin Dashboard' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard' })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Manage Bookings' }).click()
    await expect(page).toHaveURL(/\/admin\/bookings$/)
    await expect(
      page.getByRole('columnheader', { name: 'Admin Notes' })
    ).toBeVisible()

    await page.getByLabel('Search').fill('PW Admin Update Booking')
    await getBookingRow(page, booking.id).click()

    const sidePanel = page.getByTestId('admin-booking-side-panel')
    const reservationName = uniqueName('PW Reservation')

    await sidePanel.getByLabel('Status').selectOption('confirmed')
    await expect(page.getByTestId('admin-capacity-warning')).toHaveCount(0)
    await sidePanel.getByRole('button', { name: 'Save' }).click()
    await expect(sidePanel.getByRole('alert')).toContainText(
      'Reservation name is required when confirming a booking.'
    )
    await expect(page.getByTestId(`status-badge-${booking.id}`)).toContainText(
      'Pending'
    )

    await sidePanel.getByLabel('Reservation Name').fill(reservationName)
    await sidePanel
      .getByLabel('Admin Notes')
      .fill('Approved - playwright update')
    await sidePanel.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByTestId(`status-badge-${booking.id}`)).toContainText(
      'Confirmed'
    )
    await expect(sidePanel).toContainText('Last Modified By: admin@example.com')
    await expect(getBookingRow(page, booking.id)).toContainText(
      'Approved - playwright update'
    )

    await gotoPath(page, '/bookings')
    await switchUser(page, 'other@example.com')
    await page.getByRole('tab', { name: 'Table' }).click()
    await page.getByLabel('Search').fill('PW Admin Update Booking')
    await getBookingRow(page, booking.id).click()
    await expect(
      page.locator(`[data-booking-detail-id="${booking.id}"]`)
    ).toContainText(reservationName)
  })

  test('keeps admin booking drawer Close usable while update success toast is visible', async ({
    page,
    request,
  }) => {
    const projectName = uniqueName('PW Drawer Toast Regression')
    const booking = await createBooking(request, 'drawer-toast@example.com', {
      endDate: getIsoDateOffset(12),
      hostCount: 1,
      projectGrantNumber: 'CC-DRAWER-TOAST',
      projectName,
      projectPi: 'Dr Drawer Toast',
      startDate: getIsoDateOffset(11),
      technicalLead: 'Drawer Toast Lead',
    })

    await gotoPath(page, '/admin/bookings')
    await switchUser(page, 'admin@example.com', true)
    await page.getByLabel('Search').fill(projectName)
    await expect(getBookingRow(page, booking.id)).toBeVisible()
    await getBookingRow(page, booking.id).click()

    const sidePanel = page.getByTestId('admin-booking-side-panel')
    const closeButton = sidePanel.getByRole('button', { name: 'Close' })
    await expect(sidePanel).toBeVisible()
    await expect(closeButton).toBeVisible()

    await sidePanel.getByLabel('Project PI').fill('Dr Drawer Toast Edited')
    await expect(page.getByText('Booking updated successfully.')).toHaveCount(0)

    await sidePanel.getByLabel('Admin Notes').fill('Saved with toast visible')
    await sidePanel.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Booking updated successfully.')).toBeVisible()

    await sidePanel.evaluate((panel) => {
      panel.scrollTop = 0
    })
    await expect(closeButton).toBeVisible()

    const elementAtCloseCenterText = await closeButton.evaluate((button) => {
      const rect = button.getBoundingClientRect()
      const topElement = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      )

      return topElement?.textContent?.trim() ?? ''
    })

    expect(elementAtCloseCenterText).not.toContain(
      'Booking updated successfully.'
    )

    await page.screenshot({
      fullPage: true,
      path: adminBookingDrawerToastPostfixScreenshotPath,
    })
    await closeButton.click()
    await expect(sidePanel).toHaveCount(0)
  })

  test('shows an error when an admin confirmation would exceed capacity', async ({
    page,
    request,
  }) => {
    const capacityDay = getIsoDateOffset(8)
    const existingConfirmedBooking = await createBooking(
      request,
      'existing@example.com',
      {
        endDate: capacityDay,
        hostCount: 1,
        projectName: 'PW Existing Capacity Booking',
        startDate: capacityDay,
      }
    )

    await adminUpdateBooking(request, existingConfirmedBooking, {
      status: 'confirmed',
    })

    const pendingBooking = await createBooking(request, 'other@example.com', {
      endDate: capacityDay,
      hostCount: 1,
      projectName: 'PW Capacity Conflict Booking',
      startDate: capacityDay,
    })

    await gotoPath(page, '/admin/bookings')
    await switchUser(page, 'admin@example.com', true)
    await page.getByLabel('Search').fill('PW Capacity Conflict Booking')
    await getBookingRow(page, pendingBooking.id).click()

    const sidePanel = page.getByTestId('admin-booking-side-panel')

    await sidePanel.getByLabel('Host Count').fill('2')
    await sidePanel.getByLabel('Status').selectOption('confirmed')
    await sidePanel.getByLabel('Reservation Name').fill('PW Capacity Hold')
    await expect(page.getByTestId('admin-capacity-warning')).toContainText(
      'exceed host capacity'
    )

    await sidePanel.getByRole('button', { name: 'Save' }).click()
    await expect(sidePanel.getByRole('alert')).toContainText(
      'host capacity exceeded'
    )
    await expect(
      page.getByTestId(`status-badge-${pendingBooking.id}`)
    ).toContainText('Pending')
  })

  test('manages GPU host types through the admin UI', async ({ page }) => {
    const gpuTypeName = uniqueName('PW L40')
    const createdLabel = `4 GPU ${gpuTypeName}`

    await gotoPath(page, '/admin/gpu-host-types')
    await switchUser(page, 'admin@example.com', true)

    await expect(
      page.getByRole('heading', { name: 'Manage GPU Host Types' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Add GPU Host Type' }).click()
    await page.getByPlaceholder('GPU type').fill(gpuTypeName)
    await page.getByPlaceholder('GPUs per host').fill('4')
    await page.getByPlaceholder('Available hosts').fill('8')
    await page.getByRole('button', { name: 'Save' }).click()

    const createdRow = getGpuHostTypeRow(page, createdLabel)
    await expect(createdRow).toContainText(gpuTypeName)
    await expect(createdRow).toContainText('4')
    await expect(createdRow).toContainText('8')

    const gpuEditButton = createdRow.getByRole('button', { name: 'Edit' })
    if ((await gpuEditButton.count()) > 0) {
      await gpuEditButton.click()
    }

    const editingRow = page.locator(
      '[data-gpu-host-row="true"]:has(button:has-text("Cancel"))'
    )
    const gpuInputs = editingRow.locator('input:not([type="hidden"])')
    await gpuInputs.nth(1).fill('64')
    await gpuInputs.nth(2).fill('12')
    await editingRow.getByRole('button', { name: 'Save' }).click()

    const updatedRow = getGpuHostTypeRow(page, `64 GPU ${gpuTypeName}`)
    await expect(updatedRow).toContainText(gpuTypeName)
    await expect(updatedRow).toContainText('64')
    await expect(updatedRow).toContainText('12')
  })

  test('manages workflow types through the admin UI', async ({ page }) => {
    const workflowTypeName = uniqueName('PW Workflow Type')
    const updatedWorkflowTypeName = `${workflowTypeName} Updated`

    await gotoPath(page, '/admin/workflow-types')
    await switchUser(page, 'admin@example.com', true)

    await expect(
      page.getByRole('heading', { name: 'Manage Workflow Types' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Add Workflow Type' }).click()
    await page.getByPlaceholder('Workflow type name').fill(workflowTypeName)
    await page
      .locator('form')
      .filter({ has: page.getByPlaceholder('Workflow type name') })
      .getByRole('button', { name: 'Save' })
      .click()

    const createdRow = getWorkflowTypeRow(page, workflowTypeName)
    await expect(createdRow).toBeVisible()

    await createdRow.getByRole('button', { name: 'Edit' }).click()
    const editingRow = page
      .locator('[data-workflow-row="true"]')
      .filter({ has: page.locator('input[name="name"]') })
      .first()
    await editingRow.locator('input[name="name"]').fill(updatedWorkflowTypeName)
    await editingRow.getByRole('button', { name: 'Save' }).click()

    const updatedRow = getWorkflowTypeRow(page, updatedWorkflowTypeName)
    await expect(updatedRow).toBeVisible()

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await updatedRow.getByRole('button', { name: 'Delete' }).click()

    await expect(
      page.locator('[data-workflow-row="true"]').filter({
        hasText: updatedWorkflowTypeName,
      })
    ).toHaveCount(0)
  })
})
