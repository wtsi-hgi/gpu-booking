import { expect, test } from '@playwright/test'

import { createBooking, getBookingRow, gotoPath, switchUser } from './helpers'

test.describe('workflow GPU advisory', () => {
  test('warns immediately for inference on an undesignated GPU when creating', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoPath(page, '/bookings/new?start=2028-08-17&end=2028-08-18')
    const gpu = page.getByLabel('GPU Host Type')
    const workflow = page.getByLabel('Workflow Type')
    const warning = page.getByText(
      /not designated for inference or interactive workflows/i
    )
    await expect(warning).not.toBeVisible()
    await workflow.selectOption({ label: 'Inference workloads' })
    await expect(warning).not.toBeVisible()
    for (const label of ['Inference workloads', 'Interactive workloads']) {
      await workflow.selectOption({ label })
      await gpu.selectOption({ label: '8 GPU H100' })
      await expect(warning).toBeVisible()
      await expect(workflow).not.toHaveAttribute('aria-invalid', 'true')
      await expect(gpu).not.toHaveAttribute('aria-invalid', 'true')
      await gpu.selectOption({ label: '8 GPU H200' })
      await expect(warning).not.toBeVisible()
    }
    await gpu.selectOption({ label: '8 GPU H100' })
    await workflow.selectOption({
      label: 'HPC training, one server per task/job',
    })
    await expect(warning).not.toBeVisible()
    await workflow.selectOption('')
    await expect(warning).not.toBeVisible()
    await workflow.selectOption({ label: 'Inference workloads' })
    await gpu.selectOption('')
    await expect(warning).not.toBeVisible()
    await gpu.selectOption({ label: '8 GPU H100' })
    await expect(warning).toBeVisible()
    await page.screenshot({
      path: '../.tmp/agent/workflow-gpu-warning-after.png',
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(warning).toBeVisible()
    await page.screenshot({
      path: '../.tmp/agent/workflow-gpu-warning-dark-after.png',
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.getByLabel('Host Count').selectOption('1')
    await page.getByLabel('Cost Code').fill('CC-WORKFLOW')
    await page.getByLabel('Project Name').fill('PW Workflow GPU Warning Create')
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
      await expect(
        page.getByText('Review warnings before confirming.').locator('..')
      ).not.toContainText('not designated')
      await confirm.click()
    }
    await expect(page).toHaveURL(/\/bookings$/)
    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Workflow GPU Warning Create')
    await page.locator('[data-booking-row="true"]').click()
    const panel = page.getByTestId('admin-booking-side-panel')
    await expect(
      panel.getByLabel('GPU Host Type').locator('option:checked')
    ).toHaveText('8 GPU H100')
    await expect(
      panel.getByLabel('Workflow Type').locator('option:checked')
    ).toHaveText('Inference workloads')
    await expect(
      panel.getByText(/not designated for inference or interactive workflows/i)
    ).toBeVisible()
  })

  test('warns immediately for interactive on an undesignated GPU in admin editing', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const booking = await createBooking(
      request,
      'workflow-warning@example.com',
      {
        projectName: 'PW Workflow GPU Warning Admin',
        workflowName: 'Interactive workloads',
        startDate: '2028-08-17',
        endDate: '2028-08-18',
      }
    )
    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Workflow GPU Warning Admin')
    await getBookingRow(page, booking.id).click()
    const panel = page.getByTestId('admin-booking-side-panel')
    const workflow = panel.getByLabel('Workflow Type')
    const gpu = panel.getByLabel('GPU Host Type')
    const warning = panel.getByText(
      /not designated for inference or interactive workflows/i
    )
    await expect(warning).toBeVisible()
    for (const label of ['Inference workloads', 'Interactive workloads']) {
      await workflow.selectOption({ label })
      await expect(warning).toBeVisible()
      await gpu.selectOption({ label: '8 GPU H200' })
      await expect(warning).not.toBeVisible()
      await gpu.selectOption({ label: '8 GPU H100' })
      await expect(warning).toBeVisible()
    }
    await workflow.selectOption({
      label: 'HPC training, one server per task/job',
    })
    await expect(warning).not.toBeVisible()
    await workflow.selectOption({ label: 'Inference workloads' })
    await expect(warning).toBeVisible()
    await expect(workflow).not.toHaveAttribute('aria-invalid', 'true')
    await expect(gpu).not.toHaveAttribute('aria-invalid', 'true')
    await page.screenshot({
      path: '../.tmp/agent/workflow-gpu-warning-admin-after.png',
    })
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Booking updated successfully.')).toBeVisible()
    await page.reload()
    await page.getByLabel('Search').fill('PW Workflow GPU Warning Admin')
    await getBookingRow(page, booking.id).click()
    await expect(workflow.locator('option:checked')).toHaveText(
      'Inference workloads'
    )
    await expect(gpu.locator('option:checked')).toHaveText('8 GPU H100')
    await expect(warning).toBeVisible()
  })
})

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

test.describe('configured cost code suggestions', () => {
  test('offers configured cost codes on the create form and accepts another code', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoPath(page, '/bookings/new?start=2028-04-01&end=2028-04-02')
    const costCode = page.getByLabel('Cost Code', { exact: true })
    await expect(costCode).toBeVisible()
    if (!(await costCode.getAttribute('list'))) {
      await page.screenshot({
        path: '../.tmp/agent/cost-codes-before.png',
      })
    }
    await expect
      .poll(() =>
        costCode.evaluate((element: HTMLInputElement) =>
          Array.from(element.list?.options ?? [], (option) => option.value)
        )
      )
      .toEqual(['CC-EXAMPLE-001', 'CC-EXAMPLE-002'])
    await costCode.fill('CC-EXAMPLE-001')
    await expect(costCode).toHaveValue('CC-EXAMPLE-001')
    await page.screenshot({
      path: '../.tmp/agent/cost-codes-after.png',
    })
    await costCode.fill('CC-EXTERNAL-CREATE')
    await page.getByLabel('GPU Host Type').selectOption({ label: '8 GPU H100' })
    await page.getByLabel('Host Count').selectOption('1')
    await page
      .getByLabel('Workflow Type')
      .selectOption({ label: 'Inference workloads' })
    await page.getByLabel('Project Name').fill('PW Cost Code Create')
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
    await page.getByLabel('Search').fill('PW Cost Code Create')
    await page.locator('[data-booking-row="true"]').click()
    await expect(
      page.getByTestId('admin-booking-side-panel').getByLabel('Cost Code')
    ).toHaveValue('CC-EXTERNAL-CREATE')
  })

  test('offers configured cost codes in admin editing and preserves another code', async ({
    page,
    request,
  }) => {
    const booking = await createBooking(request, 'cost-code@example.com', {
      projectName: 'PW Cost Code Admin',
      projectGrantNumber: 'CC-EXAMPLE-001',
    })
    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Cost Code Admin')
    await getBookingRow(page, booking.id).click()
    const panel = page.getByTestId('admin-booking-side-panel')
    const costCode = panel.getByLabel('Cost Code', { exact: true })
    await expect
      .poll(() =>
        costCode.evaluate((element: HTMLInputElement) =>
          Array.from(element.list?.options ?? [], (option) => option.value)
        )
      )
      .toEqual(['CC-EXAMPLE-001', 'CC-EXAMPLE-002'])
    await costCode.fill('CC-EXAMPLE-002')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Booking updated successfully.')).toBeVisible()
    await page.reload()
    await page.getByLabel('Search').fill('PW Cost Code Admin')
    await getBookingRow(page, booking.id).click()
    await expect(costCode).toHaveValue('CC-EXAMPLE-002')
    await costCode.fill('CC-EXTERNAL-ADMIN')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Booking updated successfully.')).toBeVisible()
    await page.reload()
    await page.getByLabel('Search').fill('PW Cost Code Admin')
    await getBookingRow(page, booking.id).click()
    await expect(costCode).toHaveValue('CC-EXTERNAL-ADMIN')
  })
})

test.describe('configured project PI suggestions', () => {
  test('offers PI suggestions on create and saves configured or external PIs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const pi of ['Dr Example PI One', 'External PI Create 外部', '']) {
      const projectName = `PW PI Create ${pi || 'No PI'}`
      await gotoPath(page, '/bookings/new?start=2028-05-01&end=2028-05-02')
      const projectPi = page.getByLabel('PI/Lead', { exact: true })
      await expect(projectPi).toBeVisible()
      if (!(await projectPi.getAttribute('list'))) {
        await page.screenshot({
          path: '../.tmp/agent/project-pis-before.png',
        })
      }
      await expect
        .poll(() =>
          projectPi.evaluate((element: HTMLInputElement) =>
            Array.from(element.list?.options ?? [], (option) => option.value)
          )
        )
        .toEqual([
          'Dr Example PI One',
          'Dr Example PI Two',
          'Dr Example PI Équipe',
        ])
      await projectPi.fill(pi)
      if (pi === 'Dr Example PI One') {
        await page.screenshot({
          path: '../.tmp/agent/project-pis-after.png',
        })
      }
      await page
        .getByLabel('GPU Host Type')
        .selectOption({ label: '8 GPU H100' })
      await page.getByLabel('Host Count').selectOption('1')
      await page
        .getByLabel('Workflow Type')
        .selectOption({ label: 'Inference workloads' })
      await page.getByLabel('Cost Code').fill('CC-EXAMPLE-001')
      await page.getByLabel('Project Name').fill(projectName)
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
      await page.getByLabel('Search').fill(projectName)
      await page.locator('[data-booking-row="true"]').click()
      await expect(
        page.getByTestId('admin-booking-side-panel').getByLabel('Project PI')
      ).toHaveValue(pi)
    }
  })

  test('offers PI suggestions in admin editing and preserves configured or external PIs', async ({
    page,
    request,
  }) => {
    const booking = await createBooking(request, 'project-pi@example.com', {
      projectName: 'PW Project PI Admin',
      projectPi: 'Existing External PI',
      startDate: '2028-05-05',
      endDate: '2028-05-06',
    })
    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Project PI Admin')
    await getBookingRow(page, booking.id).click()
    const panel = page.getByTestId('admin-booking-side-panel')
    const projectPi = panel.getByLabel('Project PI', { exact: true })
    await expect(projectPi).toHaveValue('Existing External PI')
    await expect
      .poll(() =>
        projectPi.evaluate((element: HTMLInputElement) =>
          Array.from(element.list?.options ?? [], (option) => option.value)
        )
      )
      .toEqual([
        'Dr Example PI One',
        'Dr Example PI Two',
        'Dr Example PI Équipe',
      ])
    for (const pi of ['Dr Example PI Équipe', 'External PI Admin 外部', '']) {
      await projectPi.fill(pi)
      await panel.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(
        page.getByText('Booking updated successfully.')
      ).toBeVisible()
      await page.reload()
      await page.getByLabel('Search').fill('PW Project PI Admin')
      await getBookingRow(page, booking.id).click()
      await expect(projectPi).toHaveValue(pi)
    }
  })
})

test.describe('configured technical lead suggestions', () => {
  test('offers technical leads on create and saves configured, external or empty values', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const lead of [
      'Example Technical Lead One',
      'External Lead Create 外部',
      '',
    ]) {
      const projectName = `PW Lead Create ${lead || 'No Lead'}`
      await gotoPath(page, '/bookings/new?start=2028-06-01&end=2028-06-02')
      const technicalLead = page.getByLabel('Technical Lead', { exact: true })
      await expect(technicalLead).toBeVisible()
      if (!(await technicalLead.getAttribute('list'))) {
        await page.screenshot({
          path: '../.tmp/agent/technical-leads-before.png',
        })
      }
      await expect
        .poll(() =>
          technicalLead.evaluate((element: HTMLInputElement) =>
            Array.from(element.list?.options ?? [], (option) => option.value)
          )
        )
        .toEqual([
          'Example Technical Lead One',
          'Example Technical Lead Équipe',
        ])
      await technicalLead.fill(lead)
      if (lead === 'Example Technical Lead One') {
        await page.screenshot({
          path: '../.tmp/agent/technical-leads-after.png',
        })
      }
      await page
        .getByLabel('GPU Host Type')
        .selectOption({ label: '8 GPU H100' })
      await page.getByLabel('Host Count').selectOption('1')
      await page
        .getByLabel('Workflow Type')
        .selectOption({ label: 'Inference workloads' })
      await page.getByLabel('Cost Code').fill('CC-EXAMPLE-001')
      await page.getByLabel('Project Name').fill(projectName)
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
      await page.getByLabel('Search').fill(projectName)
      await page.locator('[data-booking-row="true"]').click()
      await expect(
        page
          .getByTestId('admin-booking-side-panel')
          .getByLabel('Technical Lead')
      ).toHaveValue(lead)
    }
  })

  test('offers technical leads in admin editing and preserves configured, external or empty values', async ({
    page,
    request,
  }) => {
    const booking = await createBooking(request, 'technical-lead@example.com', {
      projectName: 'PW Technical Lead Admin',
      technicalLead: 'Existing External Lead',
      startDate: '2028-06-05',
      endDate: '2028-06-06',
    })
    await gotoPath(page, '/bookings')
    await switchUser(page, 'admin@example.com', true)
    await gotoPath(page, '/admin/bookings')
    await page.getByLabel('Search').fill('PW Technical Lead Admin')
    await getBookingRow(page, booking.id).click()
    const panel = page.getByTestId('admin-booking-side-panel')
    const technicalLead = panel.getByLabel('Technical Lead', { exact: true })
    await expect(technicalLead).toHaveValue('Existing External Lead')
    await expect
      .poll(() =>
        technicalLead.evaluate((element: HTMLInputElement) =>
          Array.from(element.list?.options ?? [], (option) => option.value)
        )
      )
      .toEqual(['Example Technical Lead One', 'Example Technical Lead Équipe'])
    for (const lead of [
      'Example Technical Lead Équipe',
      'External Lead Admin 外部',
      '',
    ]) {
      await technicalLead.fill(lead)
      await panel.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(
        page.getByText('Booking updated successfully.')
      ).toBeVisible()
      await page.reload()
      await page.getByLabel('Search').fill('PW Technical Lead Admin')
      await getBookingRow(page, booking.id).click()
      await expect(technicalLead).toHaveValue(lead)
    }
  })
})
