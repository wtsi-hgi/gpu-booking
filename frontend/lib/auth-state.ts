import { type UserInfo } from '@/lib/auth-contracts'

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
