import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import Home from '@/app/page'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('home page smoke test', () => {
  it('renders the front page with successful health and greeting requests', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/api/v1/health') {
        return new Response(
          JSON.stringify({ status: 'healthy', database: 'ok' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url.pathname === '/api/v1/hello') {
        return new Response(JSON.stringify({ message: 'Hello from backend' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response('Not Found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const html = renderToStaticMarkup(await Home())

    expect(html).toContain('Next.js + FastAPI')
    expect(html).toContain('Full-stack starter with Server Actions and shadcn/ui')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
