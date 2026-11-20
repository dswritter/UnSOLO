import type { Seat, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { initials } from './format'

const LABEL: Record<Seat['state'], string> = {
  organiser: 'Organiser', host: 'Host', member: 'Going', you: 'You', requested: 'Requested', held: 'Held for you', open: 'Open seat',
}

/** The signature seat row. Faces only for signed-in viewers (anonymous taken seats render solid ink). */
export function SeatRow({ seats, size = 'md', max, className, stampIndex }: {
  seats: Seat[]
  size?: 'md' | 'sm' | 'xs'
  max?: number
  className?: string
  stampIndex?: number
}) {
  const shown = max ? seats.slice(0, max) : seats
  const more = max && seats.length > max ? seats.length - max : 0
  return (
    <div className={cn('pc-seatrow', className)} role="list" aria-label={`${seats.filter((s) => s.state !== 'open').length} of ${seats.length} seats taken`}>
      {shown.map((s, i) => (
        <SeatCell key={i} seat={s} size={size} stamped={stampIndex === i} />
      ))}
      {more > 0 && <span className="pc-mono text-xs text-muted-foreground">+{more}</span>}
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
