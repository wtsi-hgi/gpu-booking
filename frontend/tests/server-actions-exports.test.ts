import { describe, expect, it } from 'vitest'

import * as actions from '@/app/actions'

describe('server actions module contract', () => {
  it('exports only functions from use server module', () => {
    const nonFunctions = Object.entries(actions)
      .filter(([, value]) => typeof value !== 'function')
      .map(([name]) => name)

    expect(nonFunctions).toEqual([])
  })

  it('exports only async functions from use server module', () => {
    const nonAsyncFunctions = Object.entries(actions)
      .filter(([, value]) => typeof value === 'function')
      .filter(([, value]) => value.constructor.name !== 'AsyncFunction')
      .map(([name]) => name)

    expect(nonAsyncFunctions).toEqual([])
  })
})
