/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

const nextThemesMocks = vi.hoisted(() => ({
  providerMock: vi.fn(),
}))

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: React.PropsWithChildren<object>) => {
    nextThemesMocks.providerMock(props)
    return createElement(
      'div',
      { 'data-testid': 'next-themes-provider' },
      children
    )
  },
}))

import { ThemeProvider } from '@/components/theme-provider'

describe('theme handling', () => {
  it('defaults to system theme selection', () => {
    render(
      createElement(ThemeProvider, null, createElement('span', null, 'content'))
    )

    expect(screen.getByText('content')).toBeTruthy()
    expect(nextThemesMocks.providerMock).toHaveBeenCalledWith({
      attribute: 'class',
      defaultTheme: 'system',
      enableSystem: true,
      disableTransitionOnChange: true,
    })
  })

  it('keeps next-themes responsible for class-driven light and dark modes', () => {
    render(
      createElement(ThemeProvider, null, createElement('span', null, 'content'))
    )

    expect(nextThemesMocks.providerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attribute: 'class',
        defaultTheme: 'system',
        enableSystem: true,
      })
    )
  })
})
