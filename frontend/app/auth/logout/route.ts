import { NextResponse } from 'next/server'

import {
  fetchOidcDiscoveryDocument,
  getFrontendOidcConfig,
  OIDC_ACCESS_TOKEN_COOKIE_NAME,
  OIDC_ID_TOKEN_COOKIE_NAME,
  resolvePostLogoutRedirectUri,
} from '@/lib/oidc'

function readIdToken(cookieHeader: string): string | undefined {
  const match = cookieHeader.match(/gpu_booking_oidc_id_token=([^;]+)/)
  if (!match) {
    return undefined
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const config = getFrontendOidcConfig()
  const idToken = readIdToken(request.headers.get('cookie') ?? '')

  const response = NextResponse.redirect(new URL('/', request.url))
  response.cookies.delete(OIDC_ACCESS_TOKEN_COOKIE_NAME)
  response.cookies.delete(OIDC_ID_TOKEN_COOKIE_NAME)

  if (!config) {
    return response
  }

  try {
    const discovery = await fetchOidcDiscoveryDocument(config.issuerUrl)
    if (!discovery.end_session_endpoint) {
      return response
    }

    const endSessionUrl = new URL(discovery.end_session_endpoint)
    endSessionUrl.searchParams.set(
      'post_logout_redirect_uri',
      resolvePostLogoutRedirectUri(requestUrl.origin, config)
    )
    if (idToken) {
      endSessionUrl.searchParams.set('id_token_hint', idToken)
    }

    const logoutResponse = NextResponse.redirect(endSessionUrl)
    logoutResponse.cookies.delete(OIDC_ACCESS_TOKEN_COOKIE_NAME)
    logoutResponse.cookies.delete(OIDC_ID_TOKEN_COOKIE_NAME)
    return logoutResponse
  } catch {
    return response
  }
}