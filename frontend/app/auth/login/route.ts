import { NextResponse } from 'next/server'

import {
  fetchOidcDiscoveryDocument,
  getFrontendOidcConfig,
  OIDC_RETURN_TO_COOKIE_NAME,
  OIDC_STATE_COOKIE_NAME,
  resolveOidcRedirectUri,
  sanitizeReturnTo,
} from '@/lib/oidc'

function buildErrorRedirect(error: string, requestUrl: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/?error=${encodeURIComponent(error)}`, requestUrl)
  )
}

export async function GET(request: Request): Promise<Response> {
  const config = getFrontendOidcConfig()
  if (!config) {
    return buildErrorRedirect('oidc_config_missing', request.url)
  }

  try {
    const requestUrl = new URL(request.url)
    const discovery = await fetchOidcDiscoveryDocument(config.issuerUrl)
    const state = crypto.randomUUID()
    const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'))
    const redirectUri = resolveOidcRedirectUri(requestUrl.origin, config)
    const authorizationUrl = new URL(discovery.authorization_endpoint)

    authorizationUrl.searchParams.set('client_id', config.clientId)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('redirect_uri', redirectUri)
    authorizationUrl.searchParams.set('scope', config.scopes.join(' '))
    authorizationUrl.searchParams.set('state', state)

    const response = NextResponse.redirect(authorizationUrl)
    response.cookies.set({
      name: OIDC_STATE_COOKIE_NAME,
      value: state,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set({
      name: OIDC_RETURN_TO_COOKIE_NAME,
      value: encodeURIComponent(returnTo),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    })

    return response
  } catch {
    return buildErrorRedirect('oidc_config_missing', request.url)
  }
}
