/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GpuHostTypeManager } from '@/components/gpu-host-type-manager'

const mocks = vi.hoisted(() => ({
  getGpuHostTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  createGpuHostTypeMock: vi.fn(),
  updateGpuHostTypeMock: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  getGpuHostTypes: mocks.getGpuHostTypesMock,
  createGpuHostType: mocks.createGpuHostTypeMock,
  updateGpuHostType: mocks.updateGpuHostTypeMock,
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

const seededGpuHostTypes = [
  {
    id: 1,
    gpu_type: 'H200',
    gpu_count: 8,
    total_count: 3,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
  {
    id: 2,
    gpu_type: 'H100',
    gpu_count: 8,
    total_count: 2,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  },
]

describe('admin GPU host types page', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()

    mocks.requireCurrentUserMock.mockResolvedValue({
      email: 'admin@example.com',
      is_admin: true,
      auth_mode: 'insecure',
    })
    mocks.getGpuHostTypesMock.mockResolvedValue(seededGpuHostTypes)
  })

  it('shows seeded GPU host rows to admins', async () => {
    const { default: AdminGpuHostTypesPage } =
      await import('@/app/admin/gpu-host-types/page')
    render(await AdminGpuHostTypesPage())

    expect(
      screen.getByRole('heading', { name: 'Manage GPU Host Types' })
    ).toBeTruthy()
    await waitFor(() => {
      const rows = document.querySelectorAll(
        'tbody tr[data-gpu-host-row="true"]'
      )
      expect(rows).toHaveLength(2)
    })
    expect(screen.getByText('8 GPU H100')).toBeTruthy()
  })

  it('supports add and edit flows in the GPU host manager', async () => {
    const user = userEvent.setup()

    mocks.createGpuHostTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => ({
        status: 'success',
        message: 'Created GPU host type L40S.',
        error: null,
        gpuHostType: {
          id: 3,
          gpu_type: (formData.get('gpu_type') ?? '').toString(),
          gpu_count: Number(formData.get('gpu_count')),
          total_count: Number(formData.get('total_count')),
          created_at: '2026-01-01T00:00:00',
          updated_at: '2026-01-01T00:00:00',
        },
      })
    )

    mocks.updateGpuHostTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => ({
        status: 'success',
        message: 'Updated GPU host type H100.',
        error: null,
        gpuHostType: {
          id: Number(formData.get('id')),
          gpu_type: (formData.get('gpu_type') ?? '').toString(),
          gpu_count: Number(formData.get('gpu_count')),
          total_count: Number(formData.get('total_count')),
          created_at: '2026-01-01T00:00:00',
          updated_at: '2026-01-01T00:00:00',
        },
      })
    )

    render(
      createElement(GpuHostTypeManager, {
        initialGpuHostTypes: seededGpuHostTypes,
      })
    )

    expect(
      document.querySelectorAll('tbody tr[data-gpu-host-row="true"]')
    ).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Add GPU Host Type' }))
    await user.type(screen.getByPlaceholderText('GPU type'), 'L40S')
    await user.type(screen.getByPlaceholderText('GPUs per host'), '4')
    await user.type(screen.getByPlaceholderText('Available hosts'), '6')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        document.querySelectorAll('tbody tr[data-gpu-host-row="true"]')
      ).toHaveLength(3)
    })
    expect(screen.getByText('4 GPU L40S')).toBeTruthy()

    const h100Cell = screen.getByText('8 GPU H100')
    const h100Row = h100Cell.closest('tr')
    if (!h100Row) {
      throw new Error('Expected H100 host row')
    }
    await user.click(within(h100Row).getByRole('button', { name: 'Edit' }))

    const editTotal = h100Row.querySelector(
      'input[name="total_count"]'
    ) as HTMLInputElement | null
    if (!editTotal) {
      throw new Error('Expected total count input for H100 host row')
    }

    await user.clear(editTotal)
    await user.type(editTotal, '5')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy()
    })
  })

  it('shows access denied to non-admin users', async () => {
    mocks.requireCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'insecure',
    })

    const { default: AdminGpuHostTypesPage } =
      await import('@/app/admin/gpu-host-types/page')
    render(await AdminGpuHostTypesPage())

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeTruthy()
    expect(mocks.getGpuHostTypesMock).not.toHaveBeenCalled()
  })
})
