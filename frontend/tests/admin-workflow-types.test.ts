/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkflowTypeManager } from '@/components/workflow-type-manager'

const mocks = vi.hoisted(() => ({
  getWorkflowTypesMock: vi.fn(),
  requireCurrentUserMock: vi.fn(),
  createWorkflowTypeMock: vi.fn(),
  updateWorkflowTypeMock: vi.fn(),
  deleteWorkflowTypeMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

const {
  getWorkflowTypesMock,
  requireCurrentUserMock,
  createWorkflowTypeMock,
  updateWorkflowTypeMock,
  deleteWorkflowTypeMock,
  toastSuccessMock,
  toastErrorMock,
} = mocks

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}))

vi.mock('@/app/actions', () => ({
  getWorkflowTypes: mocks.getWorkflowTypesMock,
  createWorkflowType: mocks.createWorkflowTypeMock,
  updateWorkflowType: mocks.updateWorkflowTypeMock,
  deleteWorkflowType: mocks.deleteWorkflowTypeMock,
  initialWorkflowTypeFormState: {
    status: 'idle',
    message: null,
    error: null,
    workflowType: null,
    deletedId: null,
  },
}))

vi.mock('@/lib/server-auth', () => ({
  requireCurrentUser: mocks.requireCurrentUserMock,
}))

type WorkflowTypeFixture = {
  id: number
  name: string
}

const seededWorkflowTypes: WorkflowTypeFixture[] = [
  { id: 1, name: 'Inference workloads' },
  { id: 2, name: 'Foundation model training' },
  { id: 3, name: 'Hyperparameter tuning' },
  { id: 4, name: 'Data preprocessing' },
]

describe('admin workflow types UI (C6)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    requireCurrentUserMock.mockResolvedValue({
      email: 'admin@example.com',
      is_admin: true,
      auth_mode: 'insecure',
    })
    getWorkflowTypesMock.mockResolvedValue(seededWorkflowTypes)
  })

  it('shows seeded workflow types in the page table', async () => {
    const { default: AdminWorkflowTypesPage } =
      await import('@/app/admin/workflow-types/page')
    render(await AdminWorkflowTypesPage())

    expect(
      screen.getByRole('heading', { name: 'Manage Workflow Types' })
    ).toBeTruthy()
    await waitFor(() => {
      const rowMatches = document.querySelectorAll(
        'tr[data-workflow-row="true"]'
      )
      expect(rowMatches).toHaveLength(4)
    })
  })

  it('adds and edits workflow types via manager form flows', async () => {
    const user = userEvent.setup()

    createWorkflowTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => ({
        status: 'success',
        message: 'Created workflow type Fine-tuning.',
        error: null,
        workflowType: {
          id: 5,
          name: (formData.get('name') ?? '').toString(),
        },
        deletedId: null,
      })
    )

    updateWorkflowTypeMock.mockImplementation(
      async (_prev: unknown, formData: FormData) => ({
        status: 'success',
        message: 'Updated workflow type Foundation model training - v2.',
        error: null,
        workflowType: {
          id: Number(formData.get('id')),
          name: (formData.get('name') ?? '').toString(),
        },
        deletedId: null,
      })
    )

    render(
      createElement(WorkflowTypeManager, {
        initialWorkflowTypes: seededWorkflowTypes,
      })
    )
    expect(
      document.querySelectorAll('tr[data-workflow-row="true"]')
    ).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Add Workflow Type' }))
    await user.type(
      screen.getByPlaceholderText('Workflow type name'),
      'Fine-tuning'
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(
        document.querySelectorAll('tr[data-workflow-row="true"]')
      ).toHaveLength(5)
    })
    expect(screen.getByText('Fine-tuning')).toBeTruthy()

    const trainingRowCell = screen.getByText('Foundation model training')
    const trainingRow = trainingRowCell.closest('tr')
    if (!trainingRow) {
      throw new Error('Expected workflow row for Foundation model training')
    }
    await user.click(within(trainingRow).getByRole('button', { name: 'Edit' }))

    const editInput = screen.getByDisplayValue('Foundation model training')
    await user.clear(editInput)
    await user.type(editInput, 'Foundation model training - v2')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => {
      expect(
        document.querySelectorAll('tr[data-workflow-row="true"]')
      ).toHaveLength(5)
    })
    expect(screen.getByText('Foundation model training - v2')).toBeTruthy()
  })

  it('shows delete-blocked toast/feedback and keeps table rows unchanged', async () => {
    const user = userEvent.setup()

    deleteWorkflowTypeMock.mockResolvedValue({
      status: 'error',
      message: null,
      error: 'Workflow type is in use by existing bookings',
      workflowType: null,
      deletedId: null,
    })

    render(
      createElement(WorkflowTypeManager, {
        initialWorkflowTypes: seededWorkflowTypes,
      })
    )
    expect(
      document.querySelectorAll('tr[data-workflow-row="true"]')
    ).toHaveLength(4)

    const targetCell = screen.getByText('Foundation model training')
    const targetRow = targetCell.closest('tr')
    if (!targetRow) {
      throw new Error('Expected workflow row for Foundation model training')
    }
    await user.click(within(targetRow).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Workflow type is in use by existing bookings'
      )
    })
    expect(
      screen.getByText('Workflow type is in use by existing bookings')
    ).toBeTruthy()
    expect(
      document.querySelectorAll('tr[data-workflow-row="true"]')
    ).toHaveLength(4)
  })

  it('deletes a workflow type not in use and removes its row from the table', async () => {
    const user = userEvent.setup()

    deleteWorkflowTypeMock.mockResolvedValue({
      status: 'success',
      message: 'Deleted workflow type Hyperparameter tuning.',
      error: null,
      workflowType: null,
      deletedId: 3,
    })

    render(
      createElement(WorkflowTypeManager, {
        initialWorkflowTypes: seededWorkflowTypes,
      })
    )

    expect(
      document.querySelectorAll('tr[data-workflow-row="true"]')
    ).toHaveLength(4)
    expect(screen.getByText('Hyperparameter tuning')).toBeTruthy()

    const targetCell = screen.getByText('Hyperparameter tuning')
    const targetRow = targetCell.closest('tr')
    if (!targetRow) {
      throw new Error('Expected workflow row for Hyperparameter tuning')
    }
    await user.click(within(targetRow).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(
        document.querySelectorAll('tr[data-workflow-row="true"]')
      ).toHaveLength(3)
    })
    expect(screen.queryByText('Hyperparameter tuning')).toBeNull()
  })
})
