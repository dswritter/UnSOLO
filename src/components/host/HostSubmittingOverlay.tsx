'use client'

import { X } from 'lucide-react'

type Props = {
  open: boolean
  /** e.g. "Submitting…" */
  message: string
  onCancel: () => void
}

/**
 * Full-screen dim + blur with centered status and a dismiss control.
 * Server requests may still complete after cancel; callers should handle late results.
 */
export function HostSubmittingOverlay({ open, message, onCancel }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/55 backdrop-blur-md px-4"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={message}
    >
      <div className="relative max-w-sm rounded-2xl border border-border bg-card/95 px-8 py-7 shadow-xl shadow-black/40 text-center">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Dismiss and cancel waiting"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="pr-6 text-base font-semibold text-foreground">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Closing ends the wait on this screen. If the request already went through, check your host dashboard.
        </p>
      </div>
    </div>
  )
}
