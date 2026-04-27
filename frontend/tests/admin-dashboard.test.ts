import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}))

import AdminDashboardPage from '@/app/admin/page'

function buildBooking(id: number, status: 'unconfirmed' | 'confirmed') {
  return {
    id,
    user_email: 'user@example.com',
    gpu_type_id: 1,
    gpu_type_name: 'NVIDIA A100',
    gpu_count: 1,
    gram_option_id: 1,
    gram_label: '80GB',
    memory_option_id: 1,
    memory_label: '500GB',
    workflow_type_id: 1,
    workflow_type_name: 'Training',
    start_date: '2026-02-10',
    end_date: '2026-02-11',
    status,
    alt_email: null,
    project_name: null,
    project_pi: null,
    project_grant_number: null,
    technical_lead: null,
    event_start_date: null,
    event_end_date: null,
    admin_notes: null,
    admin_modified_by: null,
    admin_modified_at: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    warnings: [],
  }
}

type DashboardFixture = {
  isAdmin: boolean
  pendingCount?: number
  confirmedCount?: number
  gpuTypeCount?: number
}

function mockDashboardBackendResponses({
  isAdmin,
  pendingCount = 0,
  confirmedCount = 0,
  gpuTypeCount = 0,
}: DashboardFixture) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/v1/auth/me') {
      return new Response(
        JSON.stringify({
          email: 'admin@example.com',
          is_admin: isAdmin,
          auth_mode: 'insecure',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    if (url.pathname === '/api/v1/bookings') {
      const status = url.searchParams.get('status')
      const count =
        status === 'unconfirmed'
          ? pendingCount
          : status === 'confirmed'
            ? confirmedCount
            : 0

      const bookings = Array.from({ length: count }, (_, index) =>
        buildBooking(
          index + 1,
          status === 'confirmed' ? 'confirmed' : 'unconfirmed'
        )
      )

      return new Response(JSON.stringify(bookings), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (url.pathname === '/api/v1/gpu-types') {
      const gpuTypes = Array.from({ length: gpuTypeCount }, (_, index) => ({
        id: index + 1,
        name: `GPU-${index + 1}`,
        gram_gb: 80,
        system_memory_gb: 500,
        total_count: 8,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      }))

      return new Response(JSON.stringify(gpuTypes), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404 })
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('admin dashboard page', () => {
  it('shows the dashboard with links to all admin pages for admin users', async () => {
    mockDashboardBackendResponses({
      isAdmin: true,
      pendingCount: 2,
      confirmedCount: 3,
      gpuTypeCount: 4,
    })

    const markup = renderToStaticMarkup(await AdminDashboardPage())

    expect(markup).toContain('Admin Dashboard')
    expect(markup).toContain('href="/admin/bookings"')
    expect(markup).toContain('href="/admin/gpu-types"')
    expect(markup).toContain('href="/admin/workflow-types"')
    expect(markup).toContain('href="/admin/memory-options"')
  })

  it('shows pending booking summary for admin users', async () => {
    mockDashboardBackendResponses({
      isAdmin: true,
      pendingCount: 5,
      confirmedCount: 1,
      gpuTypeCount: 2,
    })

    const markup = renderToStaticMarkup(await AdminDashboardPage())

    expect(markup).toContain('5 pending bookings')
  })

  it('shows an access denied message for non-admin users', async () => {
    const fetchMock = mockDashboardBackendResponses({ isAdmin: false })

    const markup = renderToStaticMarkup(await AdminDashboardPage())

    expect(markup).toContain('Access Denied')
    expect(markup).not.toContain('Admin Dashboard')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('redirects unauthenticated OIDC users to login', async () => {
    process.env.OIDC_ISSUER_URL = 'https://issuer.example.com'
    process.env.OIDC_CLIENT_ID = 'frontend-client'
    process.env.OIDC_CLIENT_SECRET = 'frontend-secret'

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/api/v1/auth/me') {
        return new Response(JSON.stringify({ detail: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response('Not Found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(AdminDashboardPage()).rejects.toThrow(
      'REDIRECT:/auth/login?returnTo=%2Fadmin'
    )
    expect(mocks.redirectMock).toHaveBeenCalledWith(
      '/auth/login?returnTo=%2Fadmin'
    )

    delete process.env.OIDC_ISSUER_URL
    delete process.env.OIDC_CLIENT_ID
    delete process.env.OIDC_CLIENT_SECRET
  })
})
