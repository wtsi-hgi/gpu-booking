import { expect, test, type Page } from '@playwright/test'

import {
  dragAcrossDays,
  getCurrentMonthInteractionDates,
  getDayCell,
  gotoPath,
  switchUser,
} from './helpers'

/**
 * Real-browser regressions for bug 260424-2 (today indicator + dark-mode
 * multi-day selection visibility). The previous Vitest regex-on-CSS tests
 * gave a false PASS because they only inspected `globals.css` text and
 * never rendered the calendar in a browser engine. These tests render the
 * actual app, read computed styles, and assert that the today/selection
 * cells look visibly different from a neighbouring unselected/non-today
 * cell.
 */

type Rgb = [number, number, number]

function rgbDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Read the cell's computed background-color or border-top-color and
 * convert it to an [r, g, b] triplet. Browsers may return colours in the
 * source colour space (`oklab(...)`, `color(srgb ...)`, etc.) so we coerce
 * the value into a concrete sRGB pixel by painting it onto a 1x1 canvas
 * over a fixed white base. This makes the comparison colour-space and
 * alpha-channel agnostic.
 */
async function readCellColour(
  page: Page,
  dateIso: string,
  property: 'backgroundColor' | 'borderTopColor'
): Promise<Rgb> {
  const triplet = await page.evaluate(
    ({ iso, prop }) => {
      const cell = document.querySelector(
        `[data-day-cell="true"][data-date="${iso}"]`
      )
      if (!cell) {
        throw new Error(`Day cell ${iso} not found`)
      }
      const computed = window.getComputedStyle(cell as Element)
      const colour =
        prop === 'backgroundColor'
          ? computed.backgroundColor
          : computed.borderTopColor
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('canvas 2d context unavailable')
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = colour
      ctx.fillRect(0, 0, 1, 1)
      const data = ctx.getImageData(0, 0, 1, 1).data
      return [data[0], data[1], data[2]]
    },
    { iso: dateIso, prop: property }
  )
  return [triplet[0], triplet[1], triplet[2]]
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function findNonTodayCurrentMonthCell(page: Page): Promise<string> {
  const iso = await page.evaluate(() => {
    const cell = document.querySelector(
      '[data-day-cell="true"][data-current-month="true"][data-today="false"][data-drag-selected="false"]'
    )
    return cell?.getAttribute('data-date') ?? null
  })
  if (!iso) {
    throw new Error('No non-today current-month cell found')
  }
  return iso
}

async function findUnselectedCurrentMonthCell(page: Page): Promise<string> {
  const iso = await page.evaluate(() => {
    const cell = document.querySelector(
      '[data-day-cell="true"][data-current-month="true"][data-drag-selected="false"]'
    )
    return cell?.getAttribute('data-date') ?? null
  })
  if (!iso) {
    throw new Error('No unselected current-month cell found')
  }
  return iso
}

async function forceDarkMode(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => {
    document.documentElement.classList.remove('light')
    document.documentElement.classList.add('dark')
  })
}

test.describe('calendar styling regressions (bug 260424-2)', () => {
  test('today cell has no background fill but a clearly distinct border in light mode', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    const todayIso = todayIsoUtc()
    await expect(getDayCell(page, todayIso)).toHaveAttribute(
      'data-today',
      'true'
    )
    const neighbourIso = await findNonTodayCurrentMonthCell(page)

    const todayBg = await readCellColour(page, todayIso, 'backgroundColor')
    const neighbourBg = await readCellColour(
      page,
      neighbourIso,
      'backgroundColor'
    )
    const todayBorder = await readCellColour(page, todayIso, 'borderTopColor')
    const neighbourBorder = await readCellColour(
      page,
      neighbourIso,
      'borderTopColor'
    )

    // The user does NOT want a coloured today background fill in light mode
    // (the previous yellow-pale-mix rendered as an "ugly greenish background").
    // Today's bg must be essentially identical to a normal in-month neighbour.
    expect(rgbDistance(todayBg, neighbourBg)).toBeLessThanOrEqual(4)
    // But the border must be obviously different so today is still visible.
    // Bug fix (260427-1): pre-fix distance was 289 (color-mix at 75% primary);
    // post-fix is 357 (solid `--color-primary`). Threshold 300 catches the
    // pre-fix subtlety regression in light mode.
    expect(rgbDistance(todayBorder, neighbourBorder)).toBeGreaterThanOrEqual(
      300
    )
  })

  test('today cell has no background fill but a clearly distinct border in dark mode', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')
    await forceDarkMode(page)

    const todayIso = todayIsoUtc()
    const neighbourIso = await findNonTodayCurrentMonthCell(page)

    const todayBg = await readCellColour(page, todayIso, 'backgroundColor')
    const neighbourBg = await readCellColour(
      page,
      neighbourIso,
      'backgroundColor'
    )
    const todayBorder = await readCellColour(page, todayIso, 'borderTopColor')
    const neighbourBorder = await readCellColour(
      page,
      neighbourIso,
      'borderTopColor'
    )

    expect(rgbDistance(todayBg, neighbourBg)).toBeLessThanOrEqual(4)
    // Bug fix (260427-1): pre-fix dark-mode distance was 49 (extremely subtle);
    // post-fix is 318. Threshold 300 catches the regression in dark mode.
    expect(rgbDistance(todayBorder, neighbourBorder)).toBeGreaterThanOrEqual(
      300
    )
  })

  test('Today button click runs a clearly visible CSS animation on the today cell', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    const todayIso = todayIsoUtc()

    // Move away from current month first so the Today button has a real effect.
    await page.getByRole('button', { name: 'Previous month' }).click()
    await page.getByRole('button', { name: 'Today' }).click()

    const todayCell = getDayCell(page, todayIso)
    // Class must appear quickly after click.
    await expect(todayCell).toHaveClass(/calendar-today-flash/, {
      timeout: 200,
    })
    await expect(todayCell).toHaveClass(/calendar-today-indicator/)

    const computed = await todayCell.evaluate((element) => {
      const style = window.getComputedStyle(element as Element)
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        animationIterationCount: style.animationIterationCount,
        animationTimingFunction: style.animationTimingFunction,
      }
    })

    // The flash must be a real CSS animation (not `none`).
    expect(computed.animationName).toContain('calendar-today-flash')
    // Duration must be at least 1.4s — the previous box-shadow-only flash
    // was too subtle to see; a longer duration with ease-in-out and ≥2
    // iterations gives the user time to register the animation.
    const firstDuration = computed.animationDuration.split(',')[0].trim()
    expect(parseFloat(firstDuration)).toBeGreaterThanOrEqual(1.4)
    expect(computed.animationTimingFunction).toContain('ease-in-out')
    // Must iterate at least twice so the user definitely registers the flash.
    const firstIterations = computed.animationIterationCount
      .split(',')[0]
      .trim()
    expect(Number(firstIterations)).toBeGreaterThanOrEqual(2)

    // After the flash finishes (animation × iterations + JS clear timeout),
    // the temporary class must be removed but the persistent indicator stays.
    await page.waitForTimeout(4000)
    await expect(todayCell).not.toHaveClass(/calendar-today-flash/)
    await expect(todayCell).toHaveClass(/calendar-today-indicator/)
  })

  test('multi-day selection paints a real background colour on intermediate cells in dark mode', async ({
    page,
  }) => {
    const dates = getCurrentMonthInteractionDates()

    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')
    await forceDarkMode(page)

    const startCell = getDayCell(page, dates.focus)
    const endCell = getDayCell(page, dates.focusPlusTwo)
    await dragAcrossDays(page, startCell, endCell)

    const middleIso = dates.focusPlusOne
    await expect(getDayCell(page, middleIso)).toHaveAttribute(
      'data-drag-selected',
      'true'
    )

    const unselectedIso = await findUnselectedCurrentMonthCell(page)
    const middleBg = await readCellColour(page, middleIso, 'backgroundColor')
    const unselectedBg = await readCellColour(
      page,
      unselectedIso,
      'backgroundColor'
    )

    // Stricter than round 2 (≥ 12): require an obvious background change so
    // the test fails if only the border changes (the user's complaint).
    expect(rgbDistance(middleBg, unselectedBg)).toBeGreaterThanOrEqual(30)
  })

  test('multi-day selection remains visible on intermediate cells in light mode', async ({
    page,
  }) => {
    const dates = getCurrentMonthInteractionDates()

    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    const startCell = getDayCell(page, dates.focus)
    const endCell = getDayCell(page, dates.focusPlusTwo)
    await dragAcrossDays(page, startCell, endCell)

    const middleIso = dates.focusPlusOne
    await expect(getDayCell(page, middleIso)).toHaveAttribute(
      'data-drag-selected',
      'true'
    )

    const unselectedIso = await findUnselectedCurrentMonthCell(page)
    const middleBg = await readCellColour(page, middleIso, 'backgroundColor')
    const unselectedBg = await readCellColour(
      page,
      unselectedIso,
      'backgroundColor'
    )

    expect(rgbDistance(middleBg, unselectedBg)).toBeGreaterThanOrEqual(4)
  })
})
