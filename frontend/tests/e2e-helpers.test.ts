import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentMonthInteractionDates } from '../e2e/helpers'

describe('e2e date helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the interaction window within the visible calendar grid when the month is nearly over', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'))

    expect(getCurrentMonthInteractionDates()).toEqual({
      focus: '2026-04-28',
      focusPlusOne: '2026-04-29',
      focusPlusTwo: '2026-04-30',
      focusPlusFour: '2026-05-02',
    })
  })
})
