import { type UserInfo } from '@/lib/auth-contracts'

export const DEV_USER_COOKIE_NAME = 'gpu_booking_dev_user_email'

export type AuthState = {
	email: string
	isAdmin: boolean
	authMode: UserInfo['auth_mode']
}

export function toAuthState(user: UserInfo): AuthState {
	return {
		email: user.email,
		isAdmin: user.is_admin,
		authMode: user.auth_mode,
	}
}

export function shouldShowUserSwitch(authMode: UserInfo['auth_mode']): boolean {
	return authMode === 'insecure'
}

export function setDevUserCookie(email: string): void {
	if (typeof document === 'undefined') {
		return
	}

	const trimmed = email.trim()
	if (!trimmed) {
		return
	}

	document.cookie = `${DEV_USER_COOKIE_NAME}=${encodeURIComponent(trimmed)}; path=/; samesite=lax`
}
