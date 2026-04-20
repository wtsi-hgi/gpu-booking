/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routerRefreshMock: vi.fn(),
  useAuthMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) =>
    createElement('a', { href, ...props }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.routerRefreshMock,
  }),
}))

vi.mock('@/components/auth-provider', () => ({
  useAuth: mocks.useAuthMock,
}))

import { UserSwitch } from '@/components/user-switch'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('user switch header controls', () => {
  it('shows an admin dashboard link for insecure admin users', () => {
    mocks.useAuthMock.mockReturnValue({
      authMode: 'insecure',
      email: 'sb10@sanger.ac.uk',
      error: null,
      isAdmin: true,
      loading: false,
      refresh: vi.fn(),
      switchUser: vi.fn(),
    })

    render(createElement(UserSwitch))

    const adminLink = screen.getByRole('link', { name: 'Admin Dashboard' })
    expect(adminLink.getAttribute('href')).toBe('/admin')
    expect(screen.getByRole('textbox', { name: 'Impersonate user' })).toBeTruthy()
  })

  it('keeps the admin dashboard link visible for OIDC admin users', () => {
    mocks.useAuthMock.mockReturnValue({
      authMode: 'oidc',
      email: 'sb10@sanger.ac.uk',
      error: null,
      isAdmin: true,
      loading: false,
      refresh: vi.fn(),
      switchUser: vi.fn(),
    })

    render(createElement(UserSwitch))

    const adminLink = screen.getByRole('link', { name: 'Admin Dashboard' })
    expect(adminLink.getAttribute('href')).toBe('/admin')
    expect(screen.queryByRole('textbox', { name: 'Impersonate user' })).toBeNull()
  })
})