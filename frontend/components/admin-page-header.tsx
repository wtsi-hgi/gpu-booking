import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'

type AdminPageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
}: AdminPageHeaderProps) {
  return (
    <header className="space-y-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href="/admin">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Admin Dashboard
        </Link>
      </Button>

      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-primary text-sm tracking-[0.2em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </header>
  )
}
