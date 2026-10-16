import { Check, CalendarDays, Footprints } from 'lucide-react'
import type { TripChatBookingPhase } from '@/lib/chat/tripChatAccess'

/** Membership information, not a message delivery status. */
export function TripStatusBadge({ phase, className = '' }: { phase: TripChatBookingPhase; className?: string }) {
  const label = phase === 'upcoming' ? 'Trip booked' : phase === 'ongoing' ? 'On this trip' : 'Trip completed'
  const Icon = phase === 'upcoming' ? CalendarDays : phase === 'ongoing' ? Footprints : Check
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium ${
      phase === 'ongoing' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
    } ${className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />{label}
    </span>
  )
}
