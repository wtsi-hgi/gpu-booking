/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GpuTypeManager } from '@/components/gpu-type-manager'

const mocks = vi.hoisted(() => ({
  getGpuTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  createGpuTypeMock: vi.fn(),
  updateGpuTypeMock: vi.fn(),
}))

const {
  getGpuTypesMock,
  requireCurrentUserMock,
  createGpuTypeMock,
  updateGpuTypeMock,
} = mocks

vi.mock('@/app/actions', () => ({
  getGpuTypes: mocks.getGpuTypesMock,
  createGpuType: mocks.createGpuTypeMock,
  updateGpuType: mocks.updateGpuTypeMock,
  initialFormState: {
    status: 'idle',
    message: null,
    error: null,
    gpuType: null,
  },
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

const seededGpuTypes = [
  {
    id: 1,
    name: 'H200',
    gram_gb: 141,
    system_memory_gb: 512,
    total_count: 8,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 2,
    name: 'H100',
    gram_gb: 80,
    system_memory_gb: 500,
    total_count: 16,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 3,
    name: 'A100',
    gram_gb: 40,
    system_memory_gb: 256,
    total_count: 32,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 4,
    name: 'V100',
    gram_gb: 16,
    system_memory_gb: 128,
    total_count: 24,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
]

describe('admin gpu types page', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()

    requireCurrentUserMock.mockResolvedValue({
      email: 'admin@example.com',
      is_admin: true,
      auth_mode: 'insecure',
    })
    getGpuTypesMock.mockResolvedValue(seededGpuTypes)
  })

  it('shows seeded GPU rows to admins', async () => {
    const { default: AdminGpuTypesPage } =
      await import('@/app/admin/gpu-types/page')
    render(await AdminGpuTypesPage())

    expect(
      screen.getByRole('heading', { name: 'Manage GPU Types' })
    ).toBeTruthy()
    await waitFor(() => {
      const rows = document.querySelectorAll('tbody tr[data-gpu-row="true"]')
      expect(rows).toHaveLength(4)
    })
  })

  it('supports add and edit flows in GPU manager with row-count and value updates', async () => {
    const user = userEvent.setup()

    createGpuTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => {
        return {
          status: 'success',
          message: 'Created GPU type RTX 6000 Ada.',
          error: null,
          gpuType: {
            id: 5,
            name: (formData.get('name') ?? '').toString(),
            gram_gb: Number(formData.get('gram_gb')),
            system_memory_gb: Number(formData.get('system_memory_gb')),
            total_count: Number(formData.get('total_count')),
            created_at: '2026-01-01T00:00:00',
            updated_at: '2026-01-01T00:00:00',
          },
        }
      }
    )

    updateGpuTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => {
        return {
          status: 'success',
          message: 'Updated GPU type H100 SXM.',
          error: null,
          gpuType: {
            id: Number(formData.get('id')),
            name: (formData.get('name') ?? '').toString(),
            gram_gb: Number(formData.get('gram_gb')),
            system_memory_gb: Number(formData.get('system_memory_gb')),
            total_count: Number(formData.get('total_count')),
            created_at: '2026-01-01T00:00:00',
            updated_at: '2026-01-01T00:00:00',
          },
        }
      }
    )

    render(createElement(GpuTypeManager, { initialGpuTypes: seededGpuTypes }))

    expect(
      document.querySelectorAll('tbody tr[data-gpu-row="true"]')
    ).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Add GPU Type' }))
    await user.type(screen.getByPlaceholderText('Name'), 'RTX 6000 Ada')
    await user.type(screen.getByPlaceholderText('GRAM'), '48')
    await user.type(screen.getByPlaceholderText('System Memory'), '256')
    await user.type(screen.getByPlaceholderText('Total Count'), '12')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        document.querySelectorAll('tbody tr[data-gpu-row="true"]')
      ).toHaveLength(5)
    })
    expect(screen.getByText('RTX 6000 Ada')).toBeTruthy()

    const h100Cell = screen.getByText('H100')
    const h100Row = h100Cell.closest('tr')
    if (!h100Row) {
      throw new Error('Expected H100 row')
    }
    await user.click(within(h100Row).getByRole('button', { name: 'Edit' }))

    const editName = screen.getByDisplayValue('H100')
    const editGram = screen.getByDisplayValue('80')
    const editMemory = screen.getByDisplayValue('500')
    const editTotal = screen.getByDisplayValue('16')

    await user.clear(editName)
    await user.type(editName, 'H100 SXM')
    await user.clear(editGram)
    await user.type(editGram, '96')
    await user.clear(editMemory)
    await user.type(editMemory, '640')
    await user.clear(editTotal)
    await user.type(editTotal, '20')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => {
      expect(
        document.querySelectorAll('tbody tr[data-gpu-row="true"]')
      ).toHaveLength(5)
    })
    expect(screen.getByText('H100 SXM')).toBeTruthy()
    expect(screen.getByText('96 GB')).toBeTruthy()
    expect(screen.getByText('640 GB')).toBeTruthy()
    expect(screen.getByText('20')).toBeTruthy()
  })

  it('shows access denied to non-admin users', async () => {
    requireCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'insecure',
    })

    const { default: AdminGpuTypesPage } =
      await import('@/app/admin/gpu-types/page')
    render(await AdminGpuTypesPage())

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeTruthy()
    expect(getGpuTypesMock).not.toHaveBeenCalled()
  })
})
