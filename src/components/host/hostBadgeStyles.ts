import { cn } from '@/lib/utils'

/**
 * Status pills for host dashboard — tuned for both light and `.dark` HTML.
 */
export function hostModerationBadgeClass(status: string): string {
  const s = String(status).toLowerCase()
  if (s === 'approved') {
    return 'bg-emerald-500/12 text-emerald-900 border-emerald-500/30 dark:text-emerald-100'
  }
  if (s === 'pending') {
    return 'bg-amber-500/12 text-amber-900 border-amber-500/35 dark:text-amber-100'
  }
  if (s === 'rejected' || s === 'declined') {
    return 'bg-red-500/12 text-red-900 border-red-500/30 dark:text-red-100'
  }
  return 'bg-muted text-muted-foreground border-border'
}

export function hostModerationBadgeCn(status: string, extra?: string) {
  return cn('border font-medium', hostModerationBadgeClass(status), extra)
}

/** Hidden / inactive trip or listing */
export function hostHiddenStatusClass(): string {
  return 'bg-destructive/10 text-red-900 border-destructive/25 dark:text-red-100 dark:bg-destructive/20 dark:border-destructive/40'
}

/** Per-date "Full" vs "Open" on trip card */
export function hostSeatDateBadgeClass(isClosed: boolean): string {
  if (isClosed) {
    return 'bg-amber-500/12 text-amber-900 border-amber-500/30 dark:text-amber-100'
  }
  return 'bg-emerald-500/12 text-emerald-900 border-emerald-500/30 dark:text-emerald-100'
}
