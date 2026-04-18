'use client'

import { useState } from 'react'
import { ChevronDown, Clock } from 'lucide-react'
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
 * Stats-row tile: short “X days · Y nights” plus optional detail (times, travel-day note)
 * behind a chevron on small screens or on hover for hover-capable devices.
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
        'group/dur flex flex-col rounded-xl border border-border bg-card p-4 text-center outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Clock className="mx-auto mb-1 h-5 w-5 text-primary" />
      <div className="text-sm font-bold leading-tight">{short}</div>
      {hasDetail ? (
        <>
          <button
            type="button"
            className="mx-auto mt-0.5 inline-flex rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Hide duration details' : 'Show duration details'}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
          </button>
          <div
            className={cn(
              'mt-2 space-y-1.5 text-left text-[11px] leading-snug text-muted-foreground',
              'max-md:hidden',
              open && 'max-md:block',
              'md:mt-0 md:max-h-0 md:overflow-hidden md:opacity-0 md:transition-[max-height,opacity,margin-top] md:duration-200',
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
      <div className={cn('text-xs text-muted-foreground', hasDetail ? 'mt-2' : 'mt-1')}>Duration</div>
    </div>
  )
}
