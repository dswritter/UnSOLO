import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { TripCardBadge } from '@/lib/listing-card-format'

export function listingCardShellClass(muted = false) {
  return cn(
    'wander-frost-card group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card',
    'cursor-pointer outline-none transition-[transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/50',
    'hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    muted && 'opacity-80 saturate-[0.85] hover:opacity-100',
  )
}

const BADGE_TONES: Record<TripCardBadge['tone'], string> = {
  past: 'bg-black/60 text-white/90',
  urgent: 'bg-red-500/90 text-white',
  featured: 'bg-primary text-primary-foreground',
  community: 'bg-black/60 text-white',
}

export function ListingCardBadge({ badge }: { badge: TripCardBadge | null }) {
  if (!badge) return null
  return (
    <span className={cn('absolute left-2 top-2 z-10 max-w-[calc(100%-3.25rem)] truncate rounded-full px-1.5 py-1 text-[9px] font-medium leading-none backdrop-blur-md md:left-2.5 md:top-2.5 md:px-2.5 md:text-[11px] md:font-semibold', BADGE_TONES[badge.tone])}>
      {badge.label}
    </span>
  )
}

/** Match the 16:9 banner crop offered by the host upload editor. */
export function ListingCardMedia({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('relative aspect-video shrink-0 overflow-hidden bg-secondary', muted && '[&_img]:brightness-90')}>
      <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-foreground/[0.06]" />
      {children}
    </div>
  )
}

export function ListingCardPrice({ amount, suffix, from = false, muted = false }: { amount: string; suffix: string; from?: boolean; muted?: boolean }) {
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-0.5 text-[10px] leading-tight text-muted-foreground md:gap-x-1 md:text-xs">
      {from ? 'From ' : null}
      <span className={cn('text-sm font-bold md:text-base', muted ? 'text-muted-foreground' : 'text-primary')}>{amount}</span>
      {suffix ? <span className="whitespace-nowrap">/ {suffix}</span> : null}
    </p>
  )
}
