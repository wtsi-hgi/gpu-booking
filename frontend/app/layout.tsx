import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { AuthProvider } from '@/components/auth-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { UserSwitch } from '@/components/user-switch'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { toAuthState } from '@/lib/auth-state'
import { hasFrontendOidcConfig } from '@/lib/oidc'
import { getOptionalCurrentUser } from '@/lib/server-auth'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GPU Booking',
  description: 'GPU booking and capacity management application',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await getOptionalCurrentUser()
  const initialAuthState = currentUser
    ? toAuthState(currentUser)
    : {
        email: '',
        isAdmin: false,
        authMode: hasFrontendOidcConfig() ? 'oidc' : 'insecure',
      }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} bg-background text-foreground min-h-screen font-sans antialiased`}
      >
        <ThemeProvider>
          <AuthProvider initialAuthState={initialAuthState}>
            <TooltipProvider delayDuration={150}>
              <header className="border-border bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
                <div className="container mx-auto flex h-14 max-w-6xl items-center justify-end px-4">
                  <UserSwitch />
                </div>
              </header>
              {children}
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
