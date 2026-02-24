import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUser } from '@/app/actions'
import { userInfoSchema } from '@/lib/auth-contracts'
import { shouldShowUserSwitch, toAuthState } from '@/lib/auth-state'

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('auth contracts', () => {
	it('parses valid user info payloads', () => {
		const payload = {
			email: 'a@b.com',
			is_admin: true,
			auth_mode: 'insecure',
		}

		expect(userInfoSchema.parse(payload)).toEqual(payload)
	})

	it('rejects payloads missing required fields', () => {
		const payload = { email: 'a@b.com' }
		const result = userInfoSchema.safeParse(payload)
		expect(result.success).toBe(false)
	})

	it('rejects payloads with invalid email format', () => {
		const payload = {
			email: 'not-an-email',
			is_admin: true,
			auth_mode: 'insecure',
		}
		const result = userInfoSchema.safeParse(payload)
		expect(result.success).toBe(false)
	})

	it('maps backend user payloads to auth context state', () => {
		const state = toAuthState({
			email: 'user@example.com',
			is_admin: false,
			auth_mode: 'oidc',
		})

		expect(state).toEqual({
			email: 'user@example.com',
			isAdmin: false,
			authMode: 'oidc',
		})
	})

	it('shows user switch only in insecure auth mode', () => {
		expect(shouldShowUserSwitch('insecure')).toBe(true)
		expect(shouldShowUserSwitch('oidc')).toBe(false)
	})

	it('passes X-Dev-User header when requesting impersonated user info', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					email: 'testuser@example.com',
					is_admin: false,
					auth_mode: 'insecure',
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			)
		})

		vi.stubGlobal('fetch', fetchMock)

		await getCurrentUser('testuser@example.com')

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, requestInit] = fetchMock.mock.calls[0]
		const headers = new Headers((requestInit as RequestInit).headers)
		expect(headers.get('X-Dev-User')).toBe('testuser@example.com')
	})
})
