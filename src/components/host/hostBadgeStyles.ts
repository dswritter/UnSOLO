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

/** Badges on forest / host shell — high contrast on dark green cards */
export function hostModerationBadgeClassForest(status: string): string {
  const s = String(status).toLowerCase()
  if (s === 'approved') {
    return 'bg-emerald-500/35 text-white border-emerald-200/45 shadow-sm'
  }
  if (s === 'pending') {
    return 'bg-amber-500/40 text-white border-amber-200/50 shadow-sm'
  }
  if (s === 'rejected' || s === 'declined') {
    return 'bg-red-500/40 text-white border-red-200/45 shadow-sm'
  }
  return 'bg-white/15 text-white/95 border-white/25'
}

export function hostHiddenStatusClassForest(): string {
  return 'bg-red-600/35 text-white border-red-200/40 shadow-sm'
}

export function hostSeatDateBadgeClassForest(isClosed: boolean): string {
  if (isClosed) {
    return 'bg-amber-500/40 text-white border-amber-200/45'
  }
  return 'bg-emerald-500/35 text-white border-emerald-200/45'
}
