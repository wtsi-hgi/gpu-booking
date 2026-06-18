'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      richColors
      position="bottom-right"
      className="toaster group pointer-events-none"
      toastOptions={{
        className: 'group toast pointer-events-none',
      }}
    />
  )
}
