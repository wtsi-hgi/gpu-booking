import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { userInfoSchema, type UserInfo } from '@/lib/auth-contracts'
import { DEV_USER_COOKIE_NAME } from '@/lib/auth-state'
import { backendJson, BackendRequestError } from '@/lib/backend-client'
import {
  buildLoginPath,
  hasFrontendOidcConfig,
  OIDC_ACCESS_TOKEN_COOKIE_NAME,
  sanitizeReturnTo,
} from '@/lib/oidc'

async function getCookieValue(name: string): Promise<string | undefined> {
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get(name)?.value?.trim()
    if (!value) {
      return undefined
    }

    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  } catch {
    return undefined
  }
}

export async function buildAuthHeaders(
  devUserEmail?: string
): Promise<HeadersInit | undefined> {
  const accessToken = await getCookieValue(OIDC_ACCESS_TOKEN_COOKIE_NAME)
  if (accessToken) {
    return { Authorization: `Bearer ${accessToken}` }
  }

  const resolvedEmail = devUserEmail ?? (await getCookieValue(DEV_USER_COOKIE_NAME))
  if (!resolvedEmail) {
    return undefined
  }

  return { 'X-Dev-User': resolvedEmail }
}

export async function buildRequestInitWithAuth(
  init?: RequestInit,
  devUserEmail?: string
): Promise<RequestInit | undefined> {
  const authHeaders = await buildAuthHeaders(devUserEmail)
  if (!authHeaders) {
    return init
  }

  const headers = new Headers(init?.headers ?? {})
  const authHeaderValues = new Headers(authHeaders)
  authHeaderValues.forEach((value, key) => {
    headers.set(key, value)
  })

  return {
    ...(init ?? {}),
    headers,
  }
}

export async function fetchCurrentUser(
  devUserEmail?: string
): Promise<UserInfo> {
  const requestInit = await buildRequestInitWithAuth(undefined, devUserEmail)
  if (requestInit) {
    return backendJson('/api/v1/auth/me', userInfoSchema, requestInit)
  }

  return backendJson('/api/v1/auth/me', userInfoSchema)
}

export async function getOptionalCurrentUser(): Promise<UserInfo | null> {
  try {
    return await fetchCurrentUser()
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function requireCurrentUser(returnTo: string): Promise<UserInfo> {
  const user = await getOptionalCurrentUser()
  if (user) {
    return user
  }

  if (hasFrontendOidcConfig()) {
    redirect(buildLoginPath(sanitizeReturnTo(returnTo)))
  }

  redirect('/')
}
