/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getOptionalCurrentUserMock: vi.fn(),
  hasFrontendOidcConfigMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/server-auth', () => ({
  getOptionalCurrentUser: mocks.getOptionalCurrentUserMock,
}))

vi.mock('@/lib/oidc', () => ({
  buildLoginPath: (returnTo?: string) =>
    `/auth/login?returnTo=${encodeURIComponent(returnTo ?? '/bookings')}`,
  hasFrontendOidcConfig: mocks.hasFrontendOidcConfigMock,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}))

import Home from '@/app/page'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('home page', () => {
  it('renders an OIDC sign-in landing page for unauthenticated users', async () => {
    mocks.getOptionalCurrentUserMock.mockResolvedValue(null)
    mocks.hasFrontendOidcConfigMock.mockReturnValue(true)

    render(await Home())

    expect(
      screen.getByRole('heading', {
        name: 'Sign in to request and manage GPU bookings.',
      })
    ).toBeTruthy()
    const signInLink = screen.getByRole('link', { name: 'Sign In' })
    expect(signInLink.getAttribute('href')).toBe(
      '/auth/login?returnTo=%2Fbookings'
    )
  })

  it('redirects authenticated users to bookings', async () => {
    mocks.getOptionalCurrentUserMock.mockResolvedValue({
      email: 'user@example.com',
      is_admin: false,
      auth_mode: 'oidc',
    })

    await expect(Home()).rejects.toThrow('REDIRECT:/bookings')
    expect(mocks.redirectMock).toHaveBeenCalledWith('/bookings')
  })
})
