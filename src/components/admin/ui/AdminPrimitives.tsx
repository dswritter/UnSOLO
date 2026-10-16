import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function AdminPageHeader({ title, description, count, actions, className }: {
  title: string
  description?: ReactNode
  count?: number
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="flex items-baseline gap-2 text-2xl font-black tracking-tight text-foreground">
          {title}
          {typeof count === 'number' ? <span className="text-base font-semibold text-muted-foreground tabular-nums">{count.toLocaleString('en-IN')}</span> : null}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export type AdminStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONES: Record<AdminStatusTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  danger: 'bg-red-500/15 text-red-700 dark:text-red-300',
  info: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  neutral: 'bg-foreground/10 text-muted-foreground',
}

const STATUS: Record<string, { label: string; tone: AdminStatusTone }> = {
  live: { label: 'Live', tone: 'success' },
  active: { label: 'Live', tone: 'success' },
  approved: { label: 'Approved', tone: 'success' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'info' },
  claimed: { label: 'Linked', tone: 'success' },
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  requested: { label: 'Requested', tone: 'warning' },
  processing: { label: 'Processing', tone: 'warning' },
  review: { label: 'In review', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  denied: { label: 'Denied', tone: 'danger' },
  conflict: { label: 'Conflict', tone: 'danger' },
  hidden: { label: 'Hidden', tone: 'neutral' },
  inactive: { label: 'Hidden', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
}

/** One status vocabulary + colour scheme for every admin screen. */
export function StatusPill({ status, label, tone, className }: { status?: string | null; label?: string; tone?: AdminStatusTone; className?: string }) {
  const known = status ? STATUS[status.toLowerCase()] : undefined
  const text = label ?? known?.label ?? (status ? status.replace(/_/g, ' ') : '—')
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-4',
      TONES[tone ?? known?.tone ?? 'neutral'], className)}>
      {text}
    </span>
  )
}

export function AdminEmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
