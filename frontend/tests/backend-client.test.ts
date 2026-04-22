import { afterEach, describe, expect, it, vi } from 'vitest'

async function importBackendClient() {
	vi.resetModules()
	return import('@/lib/backend-client')
}

afterEach(() => {
	for (const name of [
		'GPU_BOOKING_BACKEND_URL',
		'BACKEND_URL',
		'GPU_BOOKING_BACKEND_PORT',
		'BACKEND_PORT',
	]) {
		delete process.env[name]
	}
	vi.resetModules()
})

describe('backend client env resolution', () => {
	it('prefers repo-specific backend url and port variables', async () => {
		process.env.GPU_BOOKING_BACKEND_PORT = '9123'
		process.env.GPU_BOOKING_BACKEND_URL = 'http://127.0.0.1:9124'
		process.env.BACKEND_URL = 'http://127.0.0.1:9999'

		const { buildBackendUrl } = await importBackendClient()

		expect(buildBackendUrl('/api/v1/health').toString()).toBe(
			'http://127.0.0.1:9124/api/v1/health'
		)
	})

	it('falls back to legacy backend port variables when needed', async () => {
		process.env.BACKEND_PORT = '9234'

		const { buildBackendUrl } = await importBackendClient()

		expect(buildBackendUrl('/api/v1/health').toString()).toBe(
			'http://127.0.0.1:9234/api/v1/health'
		)
	})
})
