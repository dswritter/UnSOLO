import { tripDepartureDateKey } from '@/lib/package-trip-calendar'

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed'] as const

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** A departure is running when today falls between its start and return (or start + duration). */
export function tripIsRunning(
  trip: { departure_dates: string[] | null; return_dates?: string[] | null; duration_days: number },
  today: string,
): boolean {
  const deps = trip.departure_dates ?? []
  return deps.some((dep, i) => {
    const start = tripDepartureDateKey(dep)
    const ret = trip.return_dates?.[i]
    const end = ret ? tripDepartureDateKey(ret) : addDays(start, Math.max(trip.duration_days, 1) - 1)
    return start <= today && today <= end
  })
}

/** Pending/confirmed bookings whose stay or trip hasn't finished yet. */
export function countActiveBookings(
  bookings: { status: string; travel_date?: string | null; check_in_date?: string | null; check_out_date?: string | null }[],
  today: string,
  tripDurationDays = 1,
): number {
  return bookings.filter(b => {
    if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(b.status)) return false
    const end = b.check_out_date
      ?? b.check_in_date
      ?? (b.travel_date ? addDays(tripDepartureDateKey(b.travel_date), Math.max(tripDurationDays, 1) - 1) : null)
    return end === null || tripDepartureDateKey(end) >= today
  }).length
}
