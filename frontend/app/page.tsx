import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { buildLoginPath, hasFrontendOidcConfig } from '@/lib/oidc'
import { getOptionalCurrentUser } from '@/lib/server-auth'

export default async function HomePage() {
  const user = await getOptionalCurrentUser()
  if (user) {
    redirect('/bookings')
  }

  if (!hasFrontendOidcConfig()) {
    redirect('/bookings')
  }

  return (
    <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-4xl items-center px-4 py-16">
      <section className="border-border/70 bg-card/80 w-full rounded-3xl border p-10 shadow-sm backdrop-blur">
        <div className="max-w-2xl space-y-4">
          <p className="text-primary text-sm font-medium tracking-[0.24em] uppercase">
            GPU Booking
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Sign in to request and manage GPU bookings.
          </h1>
          <p className="text-muted-foreground text-lg leading-8">
            Use your organisation account to review availability, submit new
            bookings, and manage existing requests.
          </p>
          <div className="pt-2">
            <Button asChild size="lg">
              <a href={buildLoginPath('/bookings')}>Sign In</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
