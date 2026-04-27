'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { getCurrentUser } from '@/app/actions'
import { setDevUserCookie, toAuthState, type AuthState } from '@/lib/auth-state'

type AuthContextValue = AuthState & {
  loading: boolean
  error: string | null
  switchUser: (email: string) => Promise<void>
  refresh: () => Promise<void>
}

const defaultAuthState: AuthState = {
  email: '',
  isAdmin: false,
  authMode: 'insecure',
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  initialAuthState,
}: {
  children: ReactNode
  initialAuthState?: AuthState | null
}) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthState ?? defaultAuthState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUser = useCallback(async (devUserEmail?: string) => {
    setLoading(true)
    try {
      const user = await getCurrentUser(devUserEmail)
      setAuthState(toAuthState(user))
      setError(null)
      return true
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load auth state'
      )
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const switchUser = useCallback(
    async (email: string) => {
      const didLoad = await loadUser(email)
      if (didLoad) {
        setDevUserCookie(email)
      }
    },
    [loadUser]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      loading,
      error,
      switchUser,
      refresh: () => loadUser(),
    }),
    [authState, loading, error, switchUser, loadUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
