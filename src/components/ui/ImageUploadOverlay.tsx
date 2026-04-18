'use client'

import { Loader2, X } from 'lucide-react'

/** Full-screen dimmed overlay while images upload or load; blocks accidental clicks. */
export function ImageUploadOverlay({
  open,
  message,
  subMessage,
  onCancel,
}: {
  open: boolean
  message: string
  subMessage?: string
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={message}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto" aria-hidden />
      <div className="relative flex max-w-sm flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4 shadow-2xl pointer-events-auto">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{message}</p>
            {subMessage ? (
              <p className="text-xs text-muted-foreground mt-0.5">{subMessage}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
