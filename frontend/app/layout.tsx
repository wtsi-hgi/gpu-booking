import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { AuthProvider } from '@/components/auth-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { UserSwitch } from '@/components/user-switch'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Next.js + shadcn/ui + FastAPI',
  description: 'A full-stack app with Next.js, shadcn/ui, and FastAPI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} bg-background text-foreground min-h-screen font-sans antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
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
