export const OIDC_ACCESS_TOKEN_COOKIE_NAME = 'gpu_booking_oidc_access_token'
export const OIDC_ID_TOKEN_COOKIE_NAME = 'gpu_booking_oidc_id_token'
export const OIDC_STATE_COOKIE_NAME = 'gpu_booking_oidc_state'
export const OIDC_RETURN_TO_COOKIE_NAME = 'gpu_booking_oidc_return_to'

export type FrontendOidcConfig = {
  issuerUrl: string
  clientId: string
  clientSecret: string
  redirectUri?: string
  postLogoutRedirectUri?: string
  scopes: string[]
}

type OidcDiscoveryDocument = {
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
}

const DEFAULT_RETURN_TO_PATH = '/bookings'
const DEFAULT_SCOPES = ['openid', 'profile', 'email']

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  return undefined
}

function normalizeIssuerUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getFrontendOidcConfig(): FrontendOidcConfig | null {
  const issuerUrl = readEnv(
    'GPU_BOOKING_OIDC_ISSUER_URL',
    'GPU_BOOKING_OIDC_ISSUER',
    'GPU_BOOKING_OKTA_ISSUER',
    'OIDC_ISSUER_URL',
    'OIDC_ISSUER',
    'OKTA_ISSUER'
  )
  const clientId = readEnv(
    'GPU_BOOKING_OIDC_CLIENT_ID',
    'GPU_BOOKING_OKTA_CLIENT_ID',
    'OIDC_CLIENT_ID',
    'OKTA_CLIENT_ID'
  )
  const clientSecret = readEnv(
    'GPU_BOOKING_OIDC_CLIENT_SECRET',
    'GPU_BOOKING_OKTA_CLIENT_SECRET',
    'OIDC_CLIENT_SECRET',
    'OKTA_CLIENT_SECRET'
  )

  if (!issuerUrl || !clientId || !clientSecret) {
    return null
  }

  const configuredScopes = readEnv('GPU_BOOKING_OIDC_SCOPES', 'OIDC_SCOPES')
  const scopes = configuredScopes
    ? configuredScopes.split(/\s+/).filter((value) => value.length > 0)
    : DEFAULT_SCOPES

  return {
    issuerUrl: normalizeIssuerUrl(issuerUrl),
    clientId,
    clientSecret,
    redirectUri: readEnv('GPU_BOOKING_OIDC_REDIRECT_URI', 'OIDC_REDIRECT_URI'),
    postLogoutRedirectUri: readEnv(
      'GPU_BOOKING_OIDC_POST_LOGOUT_REDIRECT_URI',
      'OIDC_POST_LOGOUT_REDIRECT_URI'
    ),
    scopes,
  }
}

export function hasFrontendOidcConfig(): boolean {
  return getFrontendOidcConfig() !== null
}

export function sanitizeReturnTo(
  value: string | null | undefined,
  fallback = DEFAULT_RETURN_TO_PATH
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  return value
}

export function buildLoginPath(returnTo?: string): string {
  const resolvedReturnTo = sanitizeReturnTo(returnTo)
  const params = new URLSearchParams({ returnTo: resolvedReturnTo })
  return `/auth/login?${params.toString()}`
}

export function resolveOidcRedirectUri(
  origin: string,
  config: FrontendOidcConfig
): string {
  return config.redirectUri ?? `${origin}/auth/callback`
}

export function resolvePostLogoutRedirectUri(
  origin: string,
  config: FrontendOidcConfig
): string {
  return config.postLogoutRedirectUri ?? `${origin}/`
}

export async function fetchOidcDiscoveryDocument(
  issuerUrl: string
): Promise<OidcDiscoveryDocument> {
  const response = await fetch(
    `${normalizeIssuerUrl(issuerUrl)}/.well-known/openid-configuration`,
    {
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    throw new Error('Failed to load OIDC discovery document')
  }

  const payload = (await response.json()) as Record<string, unknown>
  const authorizationEndpoint = payload.authorization_endpoint
  const tokenEndpoint = payload.token_endpoint
  const endSessionEndpoint = payload.end_session_endpoint

  if (
    typeof authorizationEndpoint !== 'string' ||
    typeof tokenEndpoint !== 'string'
  ) {
    throw new Error('OIDC discovery document is missing required endpoints')
  }

  return {
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    end_session_endpoint:
      typeof endSessionEndpoint === 'string' ? endSessionEndpoint : undefined,
  }
}