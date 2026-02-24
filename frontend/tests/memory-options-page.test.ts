/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryOptionManager } from '@/components/memory-option-manager'
import type { GramOption } from '@/lib/admin-contracts'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getGramOptionsMock: vi.fn(),
  getMemoryOptionsMock: vi.fn(),
  mutateGramOptionsMock: vi.fn(),
  mutateMemoryOptionsMock: vi.fn(),
}))

const {
  getCurrentUserMock,
  getGramOptionsMock,
  getMemoryOptionsMock,
  mutateGramOptionsMock,
  mutateMemoryOptionsMock,
} = mocks

vi.mock('@/app/actions', () => ({
  getCurrentUser: mocks.getCurrentUserMock,
  getGramOptions: mocks.getGramOptionsMock,
  getMemoryOptions: mocks.getMemoryOptionsMock,
  mutateGramOptions: mocks.mutateGramOptionsMock,
  mutateMemoryOptions: mocks.mutateMemoryOptionsMock,
}))

const baseGramOptions: GramOption[] = [
  { id: 1, label: '80GB', value_gb: 80, sort_order: 1 },
  { id: 2, label: '94GB', value_gb: 94, sort_order: 2 },
  { id: 3, label: '120GB', value_gb: 120, sort_order: 3 },
  { id: 4, label: '141GB', value_gb: 141, sort_order: 4 },
]

const baseMemoryOptions = [
  { id: 1, label: '256GB', value_gb: 256, sort_order: 1 },
  { id: 2, label: '384GB', value_gb: 384, sort_order: 2 },
  { id: 3, label: '500GB', value_gb: 500, sort_order: 3 },
  { id: 4, label: '750GB', value_gb: 750, sort_order: 4 },
  { id: 5, label: '1000GB', value_gb: 1000, sort_order: 5 },
  { id: 6, label: '1500GB', value_gb: 1500, sort_order: 6 },
  { id: 7, label: '2000GB', value_gb: 2000, sort_order: 7 },
]

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()

  getCurrentUserMock.mockResolvedValue({
    email: 'dev@example.com',
    is_admin: true,
    auth_mode: 'insecure',
  })
  getGramOptionsMock.mockResolvedValue(baseGramOptions)
  getMemoryOptionsMock.mockResolvedValue(baseMemoryOptions)
})

describe('admin memory options page', () => {
  it('renders real manager with both sections and seeded row counts', async () => {
    const { default: AdminMemoryOptionsPage } =
      await import('@/app/admin/memory-options/page')
    render(await AdminMemoryOptionsPage())

    const gramSection = screen.getByTestId('gram-section')
    const memorySection = screen.getByTestId('memory-section')

    expect(
      within(gramSection).getByRole('heading', { name: 'GRAM Options' })
    ).toBeTruthy()
    expect(
      within(memorySection).getByRole('heading', {
        name: 'System Memory Options',
      })
    ).toBeTruthy()
    expect(within(gramSection).getAllByTestId('gram-row')).toHaveLength(4)
    expect(within(memorySection).getAllByTestId('memory-row')).toHaveLength(7)
  })

  it('updates GRAM rows after add and delete using manager form submissions', async () => {
    const user = userEvent.setup()
    let gramItems = baseGramOptions.slice(0, 2)

    mutateGramOptionsMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => {
        const intent = (formData.get('intent') ?? '').toString()

        if (intent === 'add') {
          const created = {
            id: 3,
            label: (formData.get('label') ?? '').toString(),
            value_gb: Number(formData.get('value_gb')),
            sort_order: Number(formData.get('sort_order')),
          }
          gramItems = [...gramItems, created]
        }

        if (intent === 'delete') {
          const id = Number(formData.get('id'))
          gramItems = gramItems.filter((item) => item.id !== id)
        }

        return {
          status: 'success',
          message: 'GRAM options updated.',
          error: null,
          items: gramItems,
        }
      }
    )

    mutateMemoryOptionsMock.mockImplementation(async (prev: unknown) => prev)

    render(
      createElement(MemoryOptionManager, {
        gramOptions: baseGramOptions.slice(0, 2),
        memoryOptions: baseMemoryOptions.slice(0, 2),
        devUserEmail: 'dev@example.com',
      })
    )

    const gramSection = screen.getByTestId('gram-section')
    expect(within(gramSection).getAllByTestId('gram-row')).toHaveLength(2)

    await user.type(
      within(gramSection).getByLabelText('GRAM Options label'),
      '160GB'
    )
    await user.type(
      within(gramSection).getByLabelText('GRAM Options value GB'),
      '160'
    )
    await user.type(
      within(gramSection).getByLabelText('GRAM Options sort order'),
      '0'
    )
    await user.click(within(gramSection).getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(within(gramSection).getAllByTestId('gram-row')).toHaveLength(3)
    })
    expect(within(gramSection).getByText('160GB')).toBeTruthy()

    const addedRow = within(gramSection).getByText('160GB').closest('tr')
    if (!addedRow) {
      throw new Error('Expected row for added GRAM option')
    }
    await user.click(within(addedRow).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(within(gramSection).getAllByTestId('gram-row')).toHaveLength(2)
    })
    expect(within(gramSection).queryByText('160GB')).toBeNull()
  })
})
