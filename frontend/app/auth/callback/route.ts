import { NextResponse } from 'next/server'

import { userInfoSchema } from '@/lib/auth-contracts'
import { backendJson } from '@/lib/backend-client'
import {
  fetchOidcDiscoveryDocument,
  getFrontendOidcConfig,
  OIDC_ACCESS_TOKEN_COOKIE_NAME,
  OIDC_ID_TOKEN_COOKIE_NAME,
  OIDC_RETURN_TO_COOKIE_NAME,
  OIDC_STATE_COOKIE_NAME,
  resolveOidcRedirectUri,
  sanitizeReturnTo,
} from '@/lib/oidc'

function readCookieValue(cookieHeader: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cookieHeader.match(new RegExp(`${escapedName}=([^;]+)`))
  if (!match) {
    return undefined
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

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

  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')?.trim()
  const state = requestUrl.searchParams.get('state')?.trim()

  if (!code || !state) {
    return buildErrorRedirect('oidc_callback_invalid', request.url)
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const expectedState = readCookieValue(cookieHeader, OIDC_STATE_COOKIE_NAME)
  const returnTo = sanitizeReturnTo(
    readCookieValue(cookieHeader, OIDC_RETURN_TO_COOKIE_NAME)
  )

  if (!expectedState || expectedState !== state) {
    return buildErrorRedirect('oidc_state_mismatch', request.url)
  }

  try {
    const discovery = await fetchOidcDiscoveryDocument(config.issuerUrl)
    const redirectUri = resolveOidcRedirectUri(requestUrl.origin, config)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    })

    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    })

    if (!tokenResponse.ok) {
      return buildErrorRedirect('oidc_token_exchange_failed', request.url)
    }

    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>
    const accessToken = tokenPayload.access_token
    const idToken = tokenPayload.id_token
    const expiresIn = tokenPayload.expires_in

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return buildErrorRedirect('oidc_token_missing', request.url)
    }

    await backendJson('/api/v1/auth/me', userInfoSchema, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const response = NextResponse.redirect(new URL(returnTo, request.url))
    const maxAge = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 3600
    response.cookies.set({
      name: OIDC_ACCESS_TOKEN_COOKIE_NAME,
      value: accessToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    })
    if (typeof idToken === 'string' && idToken.length > 0) {
      response.cookies.set({
        name: OIDC_ID_TOKEN_COOKIE_NAME,
        value: idToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge,
      })
    }
    response.cookies.delete(OIDC_STATE_COOKIE_NAME)
    response.cookies.delete(OIDC_RETURN_TO_COOKIE_NAME)

    return response
  } catch {
    return buildErrorRedirect('oidc_backend_validation_failed', request.url)
  }
}
