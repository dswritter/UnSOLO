import type { Seat, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { initials } from './format'
import { SeatRing, ringCaption, segsFromSeats } from './SeatRing'

const LABEL: Record<Seat['state'], string> = {
  organiser: 'Organiser', host: 'Host', member: 'Going', you: 'You', requested: 'Requested', held: 'Held for you', open: 'Open spot',
}

/**
 * Compact seat summary: a small Full Circle ring plus its caption. Prefer <SeatRing> directly for hero use.
 * Faces only for signed-in viewers (anonymous taken seats render as plain arcs).
 */
export function SeatRow({ seats, size = 'md', className, stampIndex, variant = 'plan' }: {
  seats: Seat[]
  size?: 'md' | 'sm' | 'xs'
  /** @deprecated rings show every seat; kept for call-site compatibility */
  max?: number
  className?: string
  stampIndex?: number
  variant?: 'trip' | 'plan'
}) {
  if (seats.length === 0) return null
  const { segs, waiting, host } = segsFromSeats(seats, { hostIsBadge: false })
  const taken = segs.filter((s) => s.state !== 'open').length
  const px = size === 'md' ? 112 : size === 'sm' ? 72 : 44
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <SeatRing segs={segs} size={px} variant={variant} photo={variant === 'plan' ? host?.avatarUrl : null} waiting={size === 'md' ? waiting : null}
        animateYou={stampIndex != null} showDots={size === 'md'} />
      <p className="fc-caption">{ringCaption(segs.length, taken)}</p>
    </div>
  )
}

export function SeatCell({ seat, size = 'md', stamped }: { seat: Seat; size?: 'md' | 'sm' | 'xs'; stamped?: boolean }) {
  const u = seat.user as UserLite | null
  const label = `${LABEL[seat.state]}${u ? `: ${u.name}` : ''}`
  return (
    <span
      role="listitem"
      title={label}
      aria-label={label}
      data-state={seat.state}
      data-anon={!u && seat.state === 'member' ? 'true' : undefined}
      className={cn('pc-seat', size === 'sm' && 'pc-seat-sm', size === 'xs' && 'pc-seat-xs', stamped && 'is-stamped')}
    >
      {size !== 'xs' && u && (u.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={u.avatarUrl} alt="" loading="lazy" decoding="async" />
        : <span aria-hidden>{initials(u.name)}</span>)}
    </span>
  )
}

/**
 * Count-only seat summary for lists (departures): a slim fill bar plus "3 going · 9 open".
 * With nobody booked yet it renders a single "All 12 seats open" line instead of a row of empty outlines.
 */
export function SeatGauge({ total, left, className, showLabel = true }: { total: number | null; left: number | null; className?: string; showLabel?: boolean }) {
  const t = Math.max(total ?? 0, 0)
  if (t === 0) return null
  const l = Math.min(Math.max(left ?? t, 0), t)
  const taken = t - l
  if (taken === 0) {
    return <span className={cn('pc-gauge-empty', className)}>All {t} spots open · be the first</span>
  }
  return (
    <span className={cn('pc-gauge', className)} role="img" aria-label={`${taken} of ${t} spots taken`}>
      <span className="pc-gauge-track" aria-hidden><span className="pc-gauge-fill" style={{ width: `${Math.round((taken / t) * 100)}%` }} /></span>
      {showLabel && <span className="pc-gauge-label">{l === 0 ? 'Full' : `${taken} going · ${l} open`}</span>}
    </span>
  )
}
