# Host API (v1) — Phase 1

Native hosting for the apps. Everything here mirrors the web Hosting section (`src/app/(main)/host`, `src/actions/hosting.ts`, `src/actions/payout.ts`, `src/components/hosting/HostTripForm.tsx`) and keeps its rules, but validates **on the server** (the web form validates on the client only).

Conventions as in `api-v1.md`: JSON, `{ error: { code, message, field? } }` on failure, money in paise, dates `YYYY-MM-DD` (IST calendar days). Every route needs a signed-in user; routes marked **host** need `profiles.is_host = true` (403 `forbidden` "Host verification required" otherwise). Owner checks: a trip is yours when `packages.host_id = you`; archived trips (`archived_at` set) are never returned.

## Shared shapes

```ts
HostTripSummary = {
  id, slug, title, image: Media | null, place: { name, state } | null,
  priceFromPaise, durationDays, tripDays, tripNights, maxGroupSize,
  moderationStatus: 'pending' | 'approved' | 'rejected', isActive: boolean, bookingsPaused: boolean,
  nextDeparture: string | null,          // first departure >= today not in departure_dates_closed
  departures: { date, returnDate: string | null, closed: boolean, cutoff: string | null, booked: number }[],  // upcoming only, max 24
  pendingRequests: number, approvedRequests: number, bookingCount: number,
}
HostServiceSummary = { id, slug, title, type: 'stays'|'activities'|'rentals'|'getting_around', status: 'pending'|'approved'|'rejected'|'archived', isActive, image: Media|null, itemCount, bookingCount, webEditPath }
JoinRequest = {
  id, status: 'pending'|'approved'|'rejected'|'withdrawn', message: string|null, hostResponse: string|null,
  paymentDeadline: string|null, createdAt,
  user: UserLite & { bio?: string|null, location?: string|null, age?: number|null, tripsCompleted: number, score: number },
}
RosterBooking = { id, status: 'confirmed'|'completed'|'cancelled', travelDate, confirmationCode: string|null, guests,
  lead: UserLite & { phone: string|null }, travellers: { name: string, age?: number|null, gender?: string|null }[],
  coupon: string|null, discountPaise, refundPaise: number|null, refundStatus: string|null }
TripForm = {                     // create (POST) and full edit (PUT) body; GET /host/trips/{id}/form returns the same shape
  title: string (1–100), destinationId: uuid,
  shortDescription?: string (≤150), description: string (1–20000, markdown), searchKeywords?: string (≤1200),
  meetingAddress?: string (≤300), meetingPoint?: { lat, lon, label } | null,
  pricePaise: int ≥100, compareAtPaise?: int > pricePaise | null,
  priceVariants?: { description: string (1–80), pricePaise: int ≥100, compareAtPaise?: int > pricePaise | null }[] (0 or 2–10; when present pricePaise = min tier),
  tripDays: int 1–60, tripNights: int 0–60, excludeFirstDayTravel: boolean,
  departureTime: 'morning'|'evening', returnTime: 'morning'|'evening',
  maxGroupSize: int 2–platform max (host_max_group_size, default 50),
  difficulty: 'easy'|'moderate'|'challenging',
  departures: { date, returnDate }[] (1–732; valid dates, returnDate ≥ date, unique date, new dates not in the past),
  includes: string[] (≤30, each 1–60),
  images: url[] (1–12; our storage only; first = cover; 16:9),
  joinPreferences: { paymentTiming: 'after_host_approval'|'pay_on_booking', tokenDepositEnabled: boolean, tokenAmountPaise?: int (≥100, ≤ min price),
                     minTripsCompleted?: int ≥0, genderPreference?: 'men'|'women'|null, interestTags?: string[] ≤20, minAge?: int 18–99|null, maxAge?: int 18–99|null },
}
```

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/host` | user | Dashboard → `{ isHost, payoutConfigured, stats: { totalTrips, activeTrips, pendingRequests, totalEarnedPaise, pendingPayoutPaise }, attention: { kind: 'payout'\|'requests'\|'trip_rejected'\|'listing_rejected', title, body, tripId?, listingId? }[], trips: HostTripSummary[], services: HostServiceSummary[], upcoming: { tripId, title, date, booked, maxGroupSize }[] (next 5) }`. Not a host → `isHost:false` and empty lists (no 403), so the app can show "Become a host". |
| GET | `/host/form-options` | host | `{ destinations: { id, name, state }[], includes: string[], interestTags: string[], maxGroupSize, platformFeePercent }` |
| POST | `/host/destinations` `{ name, state }` | host | Find-or-create (dedupe by name+state, case-insensitive, country India) → `{ id, name, state }` |
| POST | `/host/trips` `TripForm` | host + payout configured | Creates with `moderation_status='pending'`, `is_active=false`, slug = slugified title (≤60) + base36 time; notifies admins ("New Community Trip for Review", link `/admin/community-trips`); sets `phone_public=true`. → `{ id, slug, moderationStatus }`. Payout missing → 409 `conflict` field `payout`. |
| GET | `/host/trips/{id}` | owner | `{ trip: HostTripSummary, requests: { pending: JoinRequest[], processed: JoinRequest[] }, roster: RosterBooking[], interested: UserLite[], pendingClaims: number, webManagePath: '/host/{id}' }` |
| GET | `/host/trips/{id}/form` | owner | `TripForm` filled from the trip (for editing) |
| PUT | `/host/trips/{id}` `TripForm` | owner | Full edit. Same validation. On an approved trip, changing anything outside the operational fields (departures, tripDays/Nights, excludeFirstDayTravel, departure/returnTime, maxGroupSize) sets `moderation_status='pending'` and notifies admins ("Trip Edit Needs Review"). Rejected trip edited → `pending` (resubmitted) + admins notified. Changing departures prunes `departure_dates_closed` and `booking_cutoff_dates` to remaining dates. → `{ id, moderationStatus, needsReapproval }` |
| PATCH | `/host/trips/{id}` `{ isActive?, bookingsPaused?, closeDate?: { date, closed }, cutoff?: { date, cutoff: string\|null } }` | owner | Quick switches (no moderation change). `isActive:true` only when approved. `closeDate.date` / `cutoff.date` must be a departure; `cutoff ≤ date`. → `HostTripSummary` |
| DELETE | `/host/trips/{id}` | owner | Same as web `deleteMyHostedTrip`: blocked (409) while a departure is running or there are active bookings (pending/confirmed not ended); archives if any bookings exist, else hard delete (archive on FK error). → `{ archived: boolean }` |
| PUT | `/host/requests/{id}` `{ decision: 'approve'\|'reject', reason?: string ≤300 }` | trip owner | Only from `pending` (409 otherwise). Approve: `approved`, `payment_deadline = now + 48h`, notify traveller + `sendJoinRequestApprovedEmail`. Reject: `rejected`, `host_response = reason`, notify + `sendJoinRequestRejectedEmail`. → `JoinRequest` |
| PATCH | `/host/services/{id}` `{ isActive }` | primary host | Toggle a stay/activity/rental on or off → `HostServiceSummary` |
| GET | `/host/payout` | host | `{ method: 'upi'\|'bank'\|null, upiId, bankAccountName, bankAccountNumberMasked, bankIfsc, configured }` (account number masked to last 4) |
| PUT | `/host/payout` `{ method, upiId?, bankAccountName?, bankAccountNumber?, bankIfsc? }` | host | Same rules as `updatePayoutDetails`: UPI `^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$` (lowercased); bank name ≥2, account `^[0-9]{9,18}$` (spaces stripped), IFSC `^[A-Z]{4}0[A-Z0-9]{6}$` (uppercased); the chosen method must be complete. Omitted `bankAccountNumber` keeps the saved one. → same as GET |
| GET | `/host/earnings` | host | `{ totals: { earnedPaise, pendingPaise, paidPaise }, items: { bookingId, tripTitle, travelDate, totalPaise, platformFeePaise, hostPaise, payoutStatus, payoutDate, payoutReference }[] (newest first, ≤200) }` |

Images: upload first with `POST /uploads` purpose `host` (16:9 crop on the device).
