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

function getGpuTypeRow(page: Page, name: string): Locator {
  return page.locator('[data-gpu-row="true"]').filter({ hasText: name }).first()
}

function getWorkflowTypeRow(page: Page, name: string): Locator {
  return page
    .locator('[data-workflow-row="true"]')
    .filter({ hasText: name })
    .first()
}

function getOptionRow(
  section: Locator,
  rowTestId: 'gram-row' | 'memory-row',
  label: string
): Locator {
  return section.getByTestId(rowTestId).filter({ hasText: label }).first()
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
      page.getByRole('link', { name: 'Bookings', exact: true })
    ).toHaveAttribute('href', '/bookings')

    await page.getByRole('link', { name: /Manage Bookings/i }).click()
    await expect(page).toHaveURL(/\/admin\/bookings$/)
    await expect(
      page.getByRole('heading', { name: 'Manage Bookings' })
    ).toBeVisible()

    await page.goto('/admin')
    await page.getByRole('link', { name: /GPU Types/i }).click()
    await expect(page).toHaveURL(/\/admin\/gpu-types$/)
    await expect(
      page.getByRole('heading', { name: 'Manage GPU Types' })
    ).toBeVisible()

    await page.goto('/admin')
    await page.getByRole('link', { name: /Workflow Types/i }).click()
    await expect(page).toHaveURL(/\/admin\/workflow-types$/)
    await expect(
      page.getByRole('heading', { name: 'Manage Workflow Types' })
    ).toBeVisible()

    await page.goto('/admin')
    await page.getByRole('link', { name: /Memory Options/i }).click()
    await expect(page).toHaveURL(/\/admin\/memory-options$/)
    await expect(
      page.getByRole('heading', { name: 'Memory options', exact: true })
    ).toBeVisible()
  })

  test('navigates from the admin dashboard into booking management and updates a booking', async ({
    page,
    request,
  }) => {
    const booking = await createBooking(request, 'other@example.com', {
      endDate: getIsoDateOffset(7),
      gpuCount: 2,
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

    await sidePanel.getByLabel('Status').selectOption('confirmed')
    await expect(page.getByTestId('admin-capacity-warning')).toHaveCount(0)
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
        gpuCount: 12,
        projectName: 'PW Existing Capacity Booking',
        startDate: capacityDay,
      }
    )

    await adminUpdateBooking(request, existingConfirmedBooking, {
      status: 'confirmed',
    })

    const pendingBooking = await createBooking(request, 'other@example.com', {
      endDate: capacityDay,
      gpuCount: 4,
      projectName: 'PW Capacity Conflict Booking',
      startDate: capacityDay,
    })

    await gotoPath(page, '/admin/bookings')
    await switchUser(page, 'admin@example.com', true)
    await page.getByLabel('Search').fill('PW Capacity Conflict Booking')
    await getBookingRow(page, pendingBooking.id).click()

    const sidePanel = page.getByTestId('admin-booking-side-panel')

    await sidePanel.getByLabel('GPU Count').fill('6')
    await sidePanel.getByLabel('Status').selectOption('confirmed')
    await expect(page.getByTestId('admin-capacity-warning')).toContainText(
      'exceed 100% capacity'
    )

    await sidePanel.getByRole('button', { name: 'Save' }).click()
    await expect(sidePanel.getByRole('alert')).toContainText(
      '100% capacity exceeded'
    )
    await expect(page.getByTestId(`status-badge-${pendingBooking.id}`)).toContainText(
      'Pending'
    )
  })

  test('manages GPU types through the admin UI', async ({ page }) => {
    const gpuTypeName = uniqueName('PW L40')

    await gotoPath(page, '/admin/gpu-types')
    await switchUser(page, 'admin@example.com', true)

    await expect(
      page.getByRole('heading', { name: 'Manage GPU Types' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Add GPU Type' }).click()
    await page.getByPlaceholder('Name').fill(gpuTypeName)
    await page.getByPlaceholder('GRAM').fill('48')
    await page.getByPlaceholder('System Memory').fill('256')
    await page.getByPlaceholder('Total Count').fill('8')
    await page.getByRole('button', { name: 'Save' }).click()

    const createdRow = page.locator('[data-gpu-row="true"]').last()
    await expect(createdRow).toContainText(gpuTypeName)
    await expect(createdRow).toContainText('48 GB')
    await expect(createdRow).toContainText('256 GB')
    await expect(createdRow).toContainText('8')

    const gpuEditButton = createdRow.getByRole('button', { name: 'Edit' })
    if ((await gpuEditButton.count()) > 0) {
      await gpuEditButton.click()
    }

    const editingRow = page.locator('[data-gpu-row="true"]').last()
    const gpuInputs = editingRow.locator('input:not([type="hidden"])')
    await gpuInputs.nth(1).fill('64')
    await gpuInputs.nth(2).fill('384')
    await gpuInputs.nth(3).fill('12')
    await editingRow.getByRole('button', { name: 'Save' }).click()

    const updatedRow = page.locator('[data-gpu-row="true"]').last()
    await expect(updatedRow).toContainText(gpuTypeName)
    await expect(updatedRow).toContainText('64 GB')
    await expect(updatedRow).toContainText('384 GB')
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

  test('manages GRAM and system memory options through the admin UI', async ({
    page,
  }) => {
    const gramLabel = uniqueName('PW 160GB')
    const updatedGramLabel = `${gramLabel} Updated`
    const memoryLabel = uniqueName('PW 1TB')
    const updatedMemoryLabel = `${memoryLabel} Updated`

    await gotoPath(page, '/admin/memory-options')
    await switchUser(page, 'admin@example.com', true)

    await expect(
      page.getByRole('heading', { name: 'Memory options', exact: true })
    ).toBeVisible()

    const gramSection = page.getByTestId('gram-section')
    const memorySection = page.getByTestId('memory-section')
    const gramAddForm = gramSection.locator('form').first()
    const memoryAddForm = memorySection.locator('form').first()

    await gramAddForm.getByRole('textbox').fill(gramLabel)
    await gramAddForm.getByRole('spinbutton').nth(0).fill('160')
    await gramAddForm.getByRole('spinbutton').nth(1).fill('0')
    await gramAddForm.getByRole('button', { name: 'Add' }).click()

    const createdGramRow = gramSection.getByTestId('gram-row').first()
    await expect(createdGramRow).toContainText(gramLabel)
    await expect(createdGramRow).toContainText('160')
    await expect(createdGramRow).toContainText('0')

    const gramEditButton = createdGramRow.getByRole('button', { name: 'Edit' })
    if ((await gramEditButton.count()) > 0) {
      await gramEditButton.click()
    }

    const editingGramRow = gramSection.getByTestId('gram-row').first()
    const gramInputs = editingGramRow.locator('input:not([type="hidden"])')
    await gramInputs.nth(0).fill(updatedGramLabel)
    await gramInputs.nth(1).fill('192')
    await gramInputs.nth(2).fill('1')
    await editingGramRow.getByRole('button', { name: 'Save' }).click()

    const updatedGramEditingRow = gramSection.locator(
      '[data-testid="gram-row"]:has(button:has-text("Cancel"))'
    )
    const updatedGramInputs = updatedGramEditingRow.locator(
      'input:not([type="hidden"])'
    )
    await expect(updatedGramInputs.nth(0)).toHaveValue(updatedGramLabel)
    await expect(updatedGramInputs.nth(1)).toHaveValue('192')
    await expect(updatedGramInputs.nth(2)).toHaveValue('1')
    await updatedGramEditingRow.getByRole('button', { name: 'Cancel' }).click()

    const updatedGramRow = getOptionRow(gramSection, 'gram-row', updatedGramLabel)
    await updatedGramRow.getByRole('button', { name: 'Delete' }).click()
    await expect(
      gramSection.getByTestId('gram-row').filter({ hasText: updatedGramLabel })
    ).toHaveCount(0)

    await memoryAddForm.getByRole('textbox').fill(memoryLabel)
    await memoryAddForm.getByRole('spinbutton').nth(0).fill('1024')
    await memoryAddForm.getByRole('spinbutton').nth(1).fill('0')
    await memoryAddForm.getByRole('button', { name: 'Add' }).click()

    const createdMemoryRow = memorySection.getByTestId('memory-row').first()
    await expect(createdMemoryRow).toContainText(memoryLabel)
    await expect(createdMemoryRow).toContainText('1024')
    await expect(createdMemoryRow).toContainText('0')

    const memoryEditButton = createdMemoryRow.getByRole('button', { name: 'Edit' })
    if ((await memoryEditButton.count()) > 0) {
      await memoryEditButton.click()
    }

    const editingMemoryRow = memorySection.getByTestId('memory-row').first()
    const memoryInputs = editingMemoryRow.locator('input:not([type="hidden"])')
    await memoryInputs.nth(0).fill(updatedMemoryLabel)
    await memoryInputs.nth(1).fill('1536')
    await memoryInputs.nth(2).fill('2')
    await editingMemoryRow.getByRole('button', { name: 'Save' }).click()

    const updatedMemoryEditingRow = memorySection.locator(
      '[data-testid="memory-row"]:has(button:has-text("Cancel"))'
    )
    const updatedMemoryInputs = updatedMemoryEditingRow.locator(
      'input:not([type="hidden"])'
    )
    await expect(updatedMemoryInputs.nth(0)).toHaveValue(updatedMemoryLabel)
    await expect(updatedMemoryInputs.nth(1)).toHaveValue('1536')
    await expect(updatedMemoryInputs.nth(2)).toHaveValue('2')
    await updatedMemoryEditingRow.getByRole('button', { name: 'Cancel' }).click()

    const updatedMemoryRow = getOptionRow(
      memorySection,
      'memory-row',
      updatedMemoryLabel
    )
    await updatedMemoryRow.getByRole('button', { name: 'Delete' }).click()
    await expect(
      memorySection
        .getByTestId('memory-row')
        .filter({ hasText: updatedMemoryLabel })
    ).toHaveCount(0)
  })
})
