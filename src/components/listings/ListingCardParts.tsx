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
    <span className={cn('absolute left-2.5 top-2.5 z-10 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none backdrop-blur-md', BADGE_TONES[badge.tone])}>
      {badge.label}
    </span>
  )
}

/** Portrait posters on phones; retain the compact landscape desktop cards. */
export function ListingCardMedia({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('relative aspect-[9/16] shrink-0 overflow-hidden bg-secondary md:aspect-[4/3]', muted && '[&_img]:brightness-90')}>
      <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-foreground/[0.06]" />
      {children}
    </div>
  )
}

export function ListingCardPrice({ amount, suffix, from = false, muted = false }: { amount: string; suffix: string; from?: boolean; muted?: boolean }) {
  return (
    <p className="min-w-0 truncate text-xs text-muted-foreground">
      {from ? 'From ' : null}
      <span className={cn('text-base font-bold', muted ? 'text-muted-foreground' : 'text-primary')}>{amount}</span>
      {suffix ? ` / ${suffix}` : null}
    </p>
  )
}
