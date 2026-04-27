/** @vitest-environment jsdom */

import fs from 'node:fs/promises'
import path from 'node:path'

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

  it('provides a prefers-color-scheme dark fallback before hydration', async () => {
    const globalsCssPath = path.join(process.cwd(), 'app', 'globals.css')
    const globalsCss = await fs.readFile(globalsCssPath, 'utf8')

    expect(globalsCss).toContain('@media (prefers-color-scheme: dark)')
    expect(globalsCss).toContain('html:not(.light)')
    expect(globalsCss).toContain('color-scheme: dark')
  })

  it('keeps Tailwind dark utilities aligned with next-themes class mode', async () => {
    const globalsCssPath = path.join(process.cwd(), 'app', 'globals.css')
    const globalsCss = await fs.readFile(globalsCssPath, 'utf8')

    expect(globalsCss).toContain(
      '@custom-variant dark (&:where(.dark, .dark *));'
    )
  })
})
