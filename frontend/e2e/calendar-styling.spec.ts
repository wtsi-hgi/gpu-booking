import { inflateSync } from 'node:zlib'

import { expect, test, type Page } from '@playwright/test'

import {
  dragAcrossDays,
  getCurrentMonthInteractionDates,
  getDayCell,
  gotoPath,
  switchUser,
} from './helpers'

/**
 * Real-browser regressions for calendar visual states. The today checks sample
 * rendered screenshot pixels from the actual cell frame because CSS text and
 * computed border values can pass while the painted frame remains weak or
 * absent after Tailwind/Lightning CSS processing.
 */

type Rgb = [number, number, number]

type CellFrame = {
  frameColor: Rgb
  fillColor: Rgb
  frameContrast: number
}

type ScreenshotPixels = {
  width: number
  height: number
  data: Uint8Array
}

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

function readUint32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset)
}

function paethPredictor(
  left: number,
  above: number,
  upperLeft: number
): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function parsePng(buffer: Buffer): ScreenshotPixels {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('Expected a PNG screenshot')
  }

  let offset = 8
  let width = 0
  let height = 0
  let colorType = -1
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = readUint32(buffer, offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += length + 12

    if (type === 'IHDR') {
      width = readUint32(data, 0)
      height = readUint32(data, 4)
      const bitDepth = data[8]
      colorType = data[9]
      const interlace = data[12]

      if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
        throw new Error('Unsupported PNG screenshot format')
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3
  const stride = width * bytesPerPixel
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const raw = new Uint8Array(height * stride)
  let inputOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset]
    inputOffset += 1
    const rowStart = y * stride
    const previousRowStart = rowStart - stride

    for (let x = 0; x < stride; x += 1) {
      const rawValue = inflated[inputOffset + x]
      const left = x >= bytesPerPixel ? raw[rowStart + x - bytesPerPixel] : 0
      const above = y > 0 ? raw[previousRowStart + x] : 0
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? raw[previousRowStart + x - bytesPerPixel]
          : 0

      if (filter === 0) {
        raw[rowStart + x] = rawValue
      } else if (filter === 1) {
        raw[rowStart + x] = (rawValue + left) & 0xff
      } else if (filter === 2) {
        raw[rowStart + x] = (rawValue + above) & 0xff
      } else if (filter === 3) {
        raw[rowStart + x] = (rawValue + Math.floor((left + above) / 2)) & 0xff
      } else if (filter === 4) {
        raw[rowStart + x] =
          (rawValue + paethPredictor(left, above, upperLeft)) & 0xff
      } else {
        throw new Error(`Unsupported PNG filter ${filter}`)
      }
    }

    inputOffset += stride
  }

  const rgb = new Uint8Array(width * height * 3)
  for (
    let source = 0, target = 0;
    source < raw.length;
    source += bytesPerPixel
  ) {
    rgb[target] = raw[source]
    rgb[target + 1] = raw[source + 1]
    rgb[target + 2] = raw[source + 2]
    target += 3
  }

  return { width, height, data: rgb }
}

function readPixel(image: ScreenshotPixels, x: number, y: number): Rgb {
  const safeX = Math.min(Math.max(Math.round(x), 0), image.width - 1)
  const safeY = Math.min(Math.max(Math.round(y), 0), image.height - 1)
  const offset = (safeY * image.width + safeX) * 3

  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]]
}

function averageRgb(values: Rgb[]): Rgb {
  const totals = values.reduce(
    (sum, value) => [sum[0] + value[0], sum[1] + value[1], sum[2] + value[2]],
    [0, 0, 0] satisfies Rgb
  )

  return [
    Math.round(totals[0] / values.length),
    Math.round(totals[1] / values.length),
    Math.round(totals[2] / values.length),
  ]
}

async function readRenderedCellFrame(
  page: Page,
  dateIso: string
): Promise<CellFrame> {
  const screenshot = await getDayCell(page, dateIso).screenshot()
  const image = parsePng(screenshot)
  const frameY = 2
  const frameColor = averageRgb([
    readPixel(image, image.width * 0.35, frameY),
    readPixel(image, image.width * 0.5, frameY),
    readPixel(image, image.width * 0.65, frameY),
  ])
  const fillColor = averageRgb([
    readPixel(image, image.width * 0.5, image.height * 0.5),
    readPixel(image, image.width * 0.35, image.height - 12),
    readPixel(image, image.width * 0.65, image.height - 12),
  ])

  return {
    frameColor,
    fillColor,
    frameContrast: rgbDistance(frameColor, fillColor),
  }
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function findNonTodayCurrentMonthCell(page: Page): Promise<string> {
  const iso = await page.evaluate(() => {
    const cell = Array.from(
      document.querySelectorAll(
        '[data-day-cell="true"][data-current-month="true"][data-today="false"][data-drag-selected="false"]'
      )
    ).find((candidate) => !candidate.querySelector('[data-day-usage-summary]'))
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
    window.localStorage.setItem('theme', 'dark')
  })
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains('dark'))
    )
    .toBe(true)
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

    const todayFrame = await readRenderedCellFrame(page, todayIso)
    const neighbourFrame = await readRenderedCellFrame(page, neighbourIso)

    expect(
      rgbDistance(todayFrame.fillColor, neighbourFrame.fillColor)
    ).toBeLessThanOrEqual(8)
    expect(todayFrame.frameContrast).toBeGreaterThanOrEqual(140)
    expect(neighbourFrame.frameContrast).toBeLessThanOrEqual(70)
  })

  test('only the data-today cell receives the strong frame in light mode', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')

    const todayIso = todayIsoUtc()
    const neighbourIso = await findNonTodayCurrentMonthCell(page)

    await page.evaluate((iso) => {
      document
        .querySelector(`[data-day-cell="true"][data-date="${iso}"]`)
        ?.classList.add('calendar-today-indicator')
    }, neighbourIso)

    const todayFrame = await readRenderedCellFrame(page, todayIso)
    const neighbourFrame = await readRenderedCellFrame(page, neighbourIso)

    expect(todayFrame.frameContrast).toBeGreaterThanOrEqual(140)
    expect(neighbourFrame.frameContrast).toBeLessThanOrEqual(70)
    expect(
      rgbDistance(todayFrame.frameColor, neighbourFrame.frameColor)
    ).toBeGreaterThanOrEqual(120)
  })

  test('today cell has no background fill but a clearly distinct border in dark mode', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')
    await forceDarkMode(page)

    const todayIso = todayIsoUtc()
    const neighbourIso = await findNonTodayCurrentMonthCell(page)

    const todayFrame = await readRenderedCellFrame(page, todayIso)
    const neighbourFrame = await readRenderedCellFrame(page, neighbourIso)

    expect(
      rgbDistance(todayFrame.fillColor, neighbourFrame.fillColor)
    ).toBeLessThanOrEqual(8)
    expect(todayFrame.frameContrast).toBeGreaterThanOrEqual(180)
    expect(neighbourFrame.frameContrast).toBeLessThanOrEqual(70)
  })

  test('only the data-today cell receives the strong frame in dark mode', async ({
    page,
  }) => {
    await gotoPath(page, '/bookings')
    await switchUser(page, 'researcher@example.com')
    await forceDarkMode(page)

    const todayIso = todayIsoUtc()
    const neighbourIso = await findNonTodayCurrentMonthCell(page)

    await page.evaluate((iso) => {
      document
        .querySelector(`[data-day-cell="true"][data-date="${iso}"]`)
        ?.classList.add('calendar-today-indicator')
    }, neighbourIso)

    const todayFrame = await readRenderedCellFrame(page, todayIso)
    const neighbourFrame = await readRenderedCellFrame(page, neighbourIso)

    expect(todayFrame.frameContrast).toBeGreaterThanOrEqual(180)
    expect(neighbourFrame.frameContrast).toBeLessThanOrEqual(70)
    expect(
      rgbDistance(todayFrame.frameColor, neighbourFrame.frameColor)
    ).toBeGreaterThanOrEqual(160)
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
