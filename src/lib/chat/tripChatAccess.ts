/** Trip chat: who may access, and how we label members (badges). */

import {
  tripEndDateIsoForBooking,
  type TripPackageCalendar,
} from '@/lib/package-trip-calendar'

export type TripChatBookingPhase = 'upcoming' | 'ongoing' | 'completed'

export type TripBookingRow = {
  status: string
  travel_date: string
}

export type TripPackageForChat = TripPackageCalendar

function parseTravelDate(travelDate: string): Date {
  const d = new Date(travelDate + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function endOfTripCalendarDay(tripEndDateStr: string): Date {
  const end = parseTravelDate(tripEndDateStr)
  end.setHours(23, 59, 59, 999)
  return end
}

/** Phase for chat access + UI badge (null = no access for this row). */
export function computeTripChatPhase(
  booking: TripBookingRow,
  pkg: TripPackageForChat,
  now = new Date(),
): TripChatBookingPhase | null {
  if (booking.status === 'cancelled') return null
  if (!['pending', 'confirmed', 'completed'].includes(booking.status)) return null

  if (booking.status === 'completed') return 'completed'

  const start = parseTravelDate(booking.travel_date)
  start.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const endStr = tripEndDateIsoForBooking(booking.travel_date, pkg)
  const tripEnd = endOfTripCalendarDay(endStr)

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
  pkg: TripPackageForChat,
  now = new Date(),
): TripChatBookingPhase | null {
  let best: TripChatBookingPhase | null = null
  let rank = 0
  for (const b of bookings) {
    const phase = computeTripChatPhase(b, pkg, now)
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
  pkg: TripPackageForChat,
  now = new Date(),
): boolean {
  return bestTripChatPhaseForUser(bookings, pkg, now) !== null
}
