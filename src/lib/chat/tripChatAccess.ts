/** Trip chat: who may access, and how we label members (badges). */

export type TripChatBookingPhase = 'upcoming' | 'ongoing' | 'completed'

export type TripBookingRow = {
  status: string
  travel_date: string
}

function parseTravelDate(travelDate: string): Date {
  const d = new Date(travelDate + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function endOfTripDay(travelDate: string, durationDays: number): Date {
  const start = parseTravelDate(travelDate)
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(1, durationDays) - 1)
  end.setHours(23, 59, 59, 999)
  return end
}

/** Phase for chat access + UI badge (null = no access for this row). */
export function computeTripChatPhase(
  booking: TripBookingRow,
  durationDays: number,
  now = new Date(),
): TripChatBookingPhase | null {
  if (booking.status === 'cancelled') return null
  if (!['pending', 'confirmed', 'completed'].includes(booking.status)) return null

  if (booking.status === 'completed') return 'completed'

  const start = parseTravelDate(booking.travel_date)
  start.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tripEnd = endOfTripDay(booking.travel_date, durationDays)

  if (today > tripEnd) return 'completed'
  if (today >= start && today <= tripEnd) return 'ongoing'
  return 'upcoming'
}

const PHASE_RANK: Record<TripChatBookingPhase, number> = {
  ongoing: 3,
  upcoming: 2,
  completed: 1,
}

export function bestTripChatPhaseForUser(
  bookings: TripBookingRow[],
  durationDays: number,
  now = new Date(),
): TripChatBookingPhase | null {
  let best: TripChatBookingPhase | null = null
  let rank = 0
  for (const b of bookings) {
    const phase = computeTripChatPhase(b, durationDays, now)
    if (!phase) continue
    const r = PHASE_RANK[phase]
    if (r > rank) {
      rank = r
      best = phase
    }
  }
  return best
}

export function userHasTripChatAccess(
  bookings: TripBookingRow[],
  durationDays: number,
  now = new Date(),
): boolean {
  return bestTripChatPhaseForUser(bookings, durationDays, now) !== null
}
