/** Host API response shapes (docs/revamp/api-v1-host.md → Shared shapes). Pure mappers from rows. */
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { PROFILE_LITE, mediaFromUrl, toUserLite, type Media, type UserLite } from '@/lib/tribe/models'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

export type HostDeparture = { date: string; returnDate: string | null; closed: boolean; cutoff: string | null; booked: number }

export type HostTripSummary = {
  id: string
  slug: string
  title: string
  image: Media | null
  place: { name: string; state: string } | null
  priceFromPaise: number
  durationDays: number
  tripDays: number
  tripNights: number
  maxGroupSize: number
  moderationStatus: 'pending' | 'approved' | 'rejected'
  isActive: boolean
  bookingsPaused: boolean
  nextDeparture: string | null
  departures: HostDeparture[]
  pendingRequests: number
  approvedRequests: number
  bookingCount: number
}

export const HOST_TRIP_SELECT =
  'id, slug, title, images, price_paise, duration_days, trip_days, trip_nights, max_group_size, moderation_status, is_active, bookings_paused, departure_dates, return_dates, departure_dates_closed, booking_cutoff_dates, host_id, archived_at, created_at, destination:destinations(name, state)'

export function moderationOf(v: unknown): HostTripSummary['moderationStatus'] {
  return v === 'approved' || v === 'rejected' ? v : 'pending'
}

/** Upcoming departures (today or later, IST), soonest first, at most 24. `booked` = seats by date. */
export function upcomingDepartures(row: Row, today: string, booked: Map<string, number> = new Map()): HostDeparture[] {
  const deps = (row.departure_dates as string[] | null) ?? []
  const rets = (row.return_dates as string[] | null) ?? []
  const closed = new Set(((row.departure_dates_closed as string[] | null) ?? []).map(tripDepartureDateKey))
  const cutoffs = (row.booking_cutoff_dates as Record<string, string> | null) ?? {}
  return deps
    .map((d, i) => {
      const date = tripDepartureDateKey(d)
      return {
        date,
        returnDate: rets[i] ? tripDepartureDateKey(rets[i]) : null,
        closed: closed.has(date),
        cutoff: str(cutoffs[date]) ? tripDepartureDateKey(cutoffs[date]) : null,
        booked: booked.get(date) ?? 0,
      }
    })
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 24)
}

export function nextOpenDeparture(row: Row, today: string): string | null {
  const closed = new Set(((row.departure_dates_closed as string[] | null) ?? []).map(tripDepartureDateKey))
  return ((row.departure_dates as string[] | null) ?? [])
    .map(tripDepartureDateKey)
    .filter((d) => d >= today && !closed.has(d))
    .sort()[0] ?? null
}

export function toHostTripSummary(
  row: Row,
  extra: { today: string; booked?: Map<string, number>; pendingRequests?: number; approvedRequests?: number; bookingCount?: number },
): HostTripSummary {
  const dest = (Array.isArray(row.destination) ? row.destination[0] : row.destination) as Row | null
  const images = (row.images as string[] | null) ?? []
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    image: mediaFromUrl(images[0]),
    place: dest ? { name: String(dest.name ?? ''), state: String(dest.state ?? '') } : null,
    priceFromPaise: Number(row.price_paise ?? 0),
    durationDays: Number(row.duration_days ?? 1),
    tripDays: Number(row.trip_days ?? row.duration_days ?? 1),
    tripNights: Number(row.trip_nights ?? 0),
    maxGroupSize: Number(row.max_group_size ?? 12),
    moderationStatus: moderationOf(row.moderation_status),
    isActive: row.is_active === true,
    bookingsPaused: row.bookings_paused === true,
    nextDeparture: nextOpenDeparture(row, extra.today),
    departures: upcomingDepartures(row, extra.today, extra.booked),
    pendingRequests: extra.pendingRequests ?? 0,
    approvedRequests: extra.approvedRequests ?? 0,
    bookingCount: extra.bookingCount ?? 0,
  }
}

export type HostServiceSummary = {
  id: string
  slug: string
  title: string
  type: 'stays' | 'activities' | 'rentals' | 'getting_around'
  status: 'pending' | 'approved' | 'rejected' | 'archived'
  isActive: boolean
  image: Media | null
  itemCount: number
  bookingCount: number
  webEditPath: string
}

export const HOST_SERVICE_SELECT = 'id, slug, title, type, status, is_active, images, host_id, archived_at, created_at'

export function toHostServiceSummary(row: Row, extra: { itemCount?: number; bookingCount?: number } = {}): HostServiceSummary {
  const t = row.type
  const s = row.status
  const images = (row.images as string[] | null) ?? []
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    type: t === 'activities' || t === 'rentals' || t === 'getting_around' ? t : 'stays',
    status: s === 'approved' || s === 'rejected' || s === 'archived' ? s : 'pending',
    isActive: row.is_active !== false,
    image: mediaFromUrl(images[0]),
    itemCount: extra.itemCount ?? 0,
    bookingCount: extra.bookingCount ?? 0,
    webEditPath: `/host/service-listings/${row.id}/edit`,
  }
}

export type JoinRequest = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  message: string | null
  hostResponse: string | null
  paymentDeadline: string | null
  createdAt: string
  user: UserLite & { bio?: string | null; location?: string | null; age?: number | null; tripsCompleted: number; score: number }
}

export const JOIN_REQUEST_SELECT =
  `id, trip_id, user_id, status, message, host_response, payment_deadline, created_at, user:profiles(${PROFILE_LITE}, bio, location, date_of_birth)`

/** Whole years since `dob` (same rule as the web join check). */
export function ageFrom(dob: unknown, now = Date.now()): number | null {
  if (typeof dob !== 'string' || !dob) return null
  const t = new Date(dob).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / (365.25 * 24 * 60 * 60 * 1000))
}

export function toJoinRequest(row: Row, score?: { trips_completed?: unknown; total_score?: unknown } | null): JoinRequest {
  const u = (Array.isArray(row.user) ? row.user[0] : row.user) as Row | null
  const s = row.status
  return {
    id: String(row.id),
    status: s === 'approved' || s === 'rejected' || s === 'withdrawn' ? s : 'pending',
    message: str(row.message),
    hostResponse: str(row.host_response),
    paymentDeadline: str(row.payment_deadline),
    createdAt: String(row.created_at ?? ''),
    user: {
      ...toUserLite(u ?? { id: row.user_id }),
      bio: str(u?.bio),
      location: str(u?.location),
      age: ageFrom(u?.date_of_birth),
      tripsCompleted: Number(score?.trips_completed ?? 0) || 0,
      score: Number(score?.total_score ?? 0) || 0,
    },
  }
}

export type RosterBooking = {
  id: string
  status: 'confirmed' | 'completed' | 'cancelled'
  travelDate: string
  confirmationCode: string | null
  guests: number
  lead: UserLite & { phone: string | null }
  travellers: { name: string; age?: number | null; gender?: string | null }[]
  coupon: string | null
  discountPaise: number
  refundPaise: number | null
  refundStatus: string | null
}

export function toRosterBooking(row: Row, coupon: string | null): RosterBooking {
  const u = (Array.isArray(row.user) ? row.user[0] : row.user) as Row | null
  const s = row.status
  const travellers = Array.isArray(row.traveller_details) ? (row.traveller_details as Row[]) : []
  const refund = row.refund_amount_paise
  return {
    id: String(row.id),
    status: s === 'completed' || s === 'cancelled' ? s : 'confirmed',
    travelDate: row.travel_date ? tripDepartureDateKey(String(row.travel_date)) : '',
    confirmationCode: str(row.confirmation_code),
    guests: Number(row.guests ?? 1),
    lead: { ...toUserLite(u), phone: str(u?.phone_number) },
    travellers: travellers
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({
        name: String(t.name ?? ''),
        age: typeof t.age === 'number' ? t.age : t.age != null && t.age !== '' && Number.isFinite(Number(t.age)) ? Number(t.age) : null,
        gender: str(t.gender),
      })),
    coupon,
    discountPaise: Number(row.discount_paise ?? 0),
    refundPaise: refund == null ? null : Number(refund),
    refundStatus: str(row.refund_status),
  }
}

export type PayoutRow = { payout_method?: unknown; upi_id?: unknown; bank_account_name?: unknown; bank_account_number?: unknown; bank_ifsc?: unknown }

/** Same rule as the web `hasPayoutConfigured`: a UPI ID with "@", or a bank account number + IFSC. */
export function isPayoutConfigured(p: PayoutRow | null | undefined): boolean {
  if (!p) return false
  const upi = typeof p.upi_id === 'string' && p.upi_id.includes('@')
  const bank = !!(p.bank_account_number && p.bank_ifsc)
  return upi || bank
}

export function maskAccount(n: unknown): string | null {
  if (typeof n !== 'string' || !n) return null
  return `${'•'.repeat(Math.max(n.length - 4, 0))}${n.slice(-4)}`
}

export function toPayout(p: PayoutRow | null | undefined) {
  return {
    method: p?.payout_method === 'upi' || p?.payout_method === 'bank' ? p.payout_method : null,
    upiId: str(p?.upi_id),
    bankAccountName: str(p?.bank_account_name),
    bankAccountNumberMasked: maskAccount(p?.bank_account_number),
    bankIfsc: str(p?.bank_ifsc),
    configured: isPayoutConfigured(p),
  }
}
