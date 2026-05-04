'use client'

import { useState } from 'react'
import { ChevronRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  packageDurationDetailLines,
  packageDurationHasExtraDetail,
  packageDurationShortLabel,
  type PackageDurationDisplay,
} from '@/lib/package-trip-calendar'

type TripDurationStatCardProps = {
  duration: PackageDurationDisplay
  className?: string
}

/**
 * Stats-row tile: short "X days · Y nights" plus optional detail (times, travel-day note).
 * On mobile the chevron sits on the right and slides the detail panel in from the right
 * over the card body, so the row never grows in height. Hover-capable devices reveal the
 * detail on hover.
 */
export function TripDurationStatCard({ duration, className }: TripDurationStatCardProps) {
  const short = packageDurationShortLabel(duration)
  const lines = packageDurationDetailLines(duration)
  const hasDetail = packageDurationHasExtraDetail(duration)
  const [open, setOpen] = useState(false)

  return (
    <div
      tabIndex={hasDetail ? 0 : undefined}
      className={cn(
        'group/dur relative flex flex-col rounded-xl border border-border bg-card p-4 text-center outline-none overflow-hidden',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Clock className="mx-auto mb-1 h-5 w-5 text-primary" />
      <div className="text-sm font-bold leading-tight">{short}</div>
      <div className="mt-1 text-xs text-muted-foreground">Duration</div>

      {hasDetail ? (
        <>
          {/* Right-side toggle — points right when collapsed, left when open. */}
          <button
            type="button"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Hide duration details' : 'Show duration details'}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>

          {/* Mobile slide-in panel: covers the card body, slides in from the right. */}
          <div
            aria-hidden={!open}
            className={cn(
              'absolute inset-0 flex flex-col justify-center gap-1 bg-card px-5 py-3 text-left',
              'transition-transform duration-200 will-change-transform md:hidden',
              open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
          >
            {lines.map((line, i) => (
              <p key={i} className="text-[11px] leading-snug text-muted-foreground break-words">
                {line}
              </p>
            ))}
          </div>

          {/* Desktop: hover/focus reveal under the label (unchanged behaviour). */}
          <div
            className={cn(
              'mt-2 space-y-1.5 text-left text-[11px] leading-snug text-muted-foreground',
              'hidden md:block',
              'md:max-h-0 md:overflow-hidden md:opacity-0 md:transition-[max-height,opacity,margin-top] md:duration-200',
              'md:group-hover/dur:mt-2 md:group-hover/dur:max-h-40 md:group-hover/dur:opacity-100',
              'md:group-focus-within/dur:mt-2 md:group-focus-within/dur:max-h-40 md:group-focus-within/dur:opacity-100',
            )}
          >
            {lines.map((line, i) => (
              <p key={i} className="break-words">
                {line}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
