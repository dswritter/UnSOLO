import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { formatDiscountLabel } from '@/lib/checkout-promos'
import { countActiveBookings, tripIsRunning } from '@/lib/host-listing-delete'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { hostDisplayName, loadHostTripSummary, loadOwnedTrip, notifyAdmins, platformMaxGroupSize, revalidateTripPages, storagePrefix } from '@/lib/host/server'
import { JOIN_REQUEST_SELECT, toJoinRequest, toRosterBooking } from '@/lib/host/shape'
import { hasSubstantiveChange, pruneToDepartures, tripFormToRow, validateTripForm } from '@/lib/host/trip-form'
import { PROFILE_LITE, toUserLite, todayIST } from '@/lib/tribe/models'
import { listingScheduleTodayISO } from '@/lib/utils'

type Row = Record<string, unknown>
type Ctx = { params: Promise<{ id: string }> }

const tripIdOf = async (params: Ctx['params']) => parseWith(uuid, (await params).id)

/** GET /host/trips/{id}: your trip with its join requests, roster, interested travellers and pending claims. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = await tripIdOf(params)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const trip = await loadHostTripSummary(ctx, user.id, id)
  const svc = ctx.service()

  const [requestsRes, rosterRes, interestsRes, claimsRes] = await Promise.all([
    ctx.db.from('join_requests').select(JOIN_REQUEST_SELECT).eq('trip_id', id).order('created_at', { ascending: false }),
    // Booker profiles and phone numbers are private under RLS; the trip is yours (checked above).
    svc.from('bookings')
      .select(`id, status, travel_date, confirmation_code, guests, traveller_details, promo_offer_id, discount_paise, refund_amount_paise, refund_status, user:profiles!bookings_user_id_fkey(${PROFILE_LITE}, phone_number)`)
      .eq('package_id', id).in('status', ['confirmed', 'completed', 'cancelled']).order('travel_date', { ascending: true }),
    ctx.db.from('package_interests').select(`user_id, user:profiles(${PROFILE_LITE})`).eq('package_id', id),
    svc.from('trip_traveller_claims').select('id', { count: 'exact', head: true }).eq('package_id', id).eq('status', 'pending'),
  ])
  if (requestsRes.error) throw requestsRes.error
  if (rosterRes.error) throw rosterRes.error
  if (interestsRes.error) throw interestsRes.error

  const requestRows = (requestsRes.data ?? []) as Row[]
  const userIds = [...new Set(requestRows.map((r) => String(r.user_id)))]
  const { data: scores } = userIds.length
    ? await ctx.db.from('leaderboard_scores').select('user_id, trips_completed, total_score').in('user_id', userIds)
    : { data: [] as Row[] }
  const scoreBy = new Map(((scores ?? []) as Row[]).map((s) => [String(s.user_id), s]))
  const requests = requestRows.map((r) => toJoinRequest(r, scoreBy.get(String(r.user_id))))

  const rosterRows = (rosterRes.data ?? []) as Row[]
  const offerIds = [...new Set(rosterRows.map((r) => r.promo_offer_id).filter(Boolean))] as string[]
  const offerLabel = new Map<string, string>()
  if (offerIds.length) {
    const { data: offers } = await svc.from('discount_offers')
      .select('id, name, promo_code, discount_kind, discount_paise, discount_percent, discount_percent_cap_paise, free_guest_count, free_guests_min_group')
      .in('id', offerIds)
    for (const o of (offers ?? []) as Row[]) {
      const name = (o.name as string | null) || (o.promo_code as string | null)?.toUpperCase() || 'Offer'
      offerLabel.set(String(o.id), `${name} (${formatDiscountLabel(o as never)})`)
    }
  }

  return ok({
    trip,
    requests: {
      pending: requests.filter((r) => r.status === 'pending'),
      processed: requests.filter((r) => r.status !== 'pending'),
    },
    roster: rosterRows.map((r) => toRosterBooking(r, r.promo_offer_id ? offerLabel.get(String(r.promo_offer_id)) ?? null : null)),
    interested: ((interestsRes.data ?? []) as Row[])
      .map((i) => (Array.isArray(i.user) ? i.user[0] : i.user) as Row | null)
      .filter((u): u is Row => !!u)
      .map((u) => toUserLite(u)),
    pendingClaims: claimsRes.count ?? 0,
    webManagePath: `/host/${id}`,
  })
})

/**
 * PUT /host/trips/{id}: full edit with a TripForm. An approved trip goes back to review only when
 * something outside the operational fields changes; a rejected trip is resubmitted.
 */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = await tripIdOf(params)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const raw = await parseJson(req, z.unknown())
  const current = await loadOwnedTrip(ctx, user.id, id)
  const svc = ctx.service()

  const form = validateTripForm(raw, { today: todayIST(), maxGroupSize: await platformMaxGroupSize(svc), storagePrefix: storagePrefix(), existing: current })
  if (form.destinationId !== current.destination_id) {
    const { data: dest } = await ctx.db.from('destinations').select('id').eq('id', form.destinationId).maybeSingle()
    if (!dest) throw new ApiError('bad_request', 'Choose a destination', { field: 'destinationId' })
  }

  const next: Row = tripFormToRow(form, (current.metadata as Row | null) ?? null)
  Object.assign(next, pruneToDepartures(current, next.departure_dates as string[]))

  const status = current.moderation_status
  const substantive = hasSubstantiveChange(current, next)
  const backToReview = status === 'approved' && substantive
  const resubmitted = status === 'rejected'
  if (backToReview || resubmitted) next.moderation_status = 'pending'

  const { data: saved, error } = await ctx.db.from('packages').update(next).eq('id', id).eq('host_id', user.id).select('id, moderation_status').single()
  if (error) throw error
  revalidateTripPages(id, current.slug)

  if (backToReview || resubmitted) {
    const hostName = await hostDisplayName(ctx.db, user.id)
    await notifyAdmins(svc, backToReview
      ? { title: 'Trip Edit Needs Review', body: `${hostName} edited "${form.title}" (was approved). Review changes and re-approve.` }
      : { title: 'Trip Resubmitted for Review', body: `${hostName} resubmitted "${form.title}" after making changes.` })
  }

  return ok({ id: saved.id, moderationStatus: saved.moderation_status ?? 'pending', needsReapproval: backToReview || resubmitted })
})

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const Patch = z.object({
  isActive: z.boolean().optional(),
  bookingsPaused: z.boolean().optional(),
  closeDate: z.object({ date: DateKey, closed: z.boolean() }).optional(),
  cutoff: z.object({ date: DateKey, cutoff: DateKey.nullable() }).optional(),
}).refine((b) => b.isActive !== undefined || b.bookingsPaused !== undefined || b.closeDate || b.cutoff, 'Nothing to change')

/** PATCH /host/trips/{id}: quick switches (live, paused, a date closed, a booking cutoff). No moderation change. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = await tripIdOf(params)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Patch)
  const trip = await loadOwnedTrip(ctx, user.id, id)
  const depKeys = new Set(((trip.departure_dates as string[] | null) ?? []).map(tripDepartureDateKey))
  const update: Row = {}

  if (b.isActive !== undefined) {
    if (b.isActive && trip.moderation_status !== 'approved') {
      throw new ApiError('conflict', 'Your trip can go live once it’s approved', { field: 'isActive' })
    }
    update.is_active = b.isActive
  }
  if (b.bookingsPaused !== undefined) update.bookings_paused = b.bookingsPaused
  if (b.closeDate) {
    if (!depKeys.has(b.closeDate.date)) throw new ApiError('bad_request', 'That date is not a departure for this trip', { field: 'closeDate.date' })
    const set = new Set(((trip.departure_dates_closed as string[] | null) ?? []).map(tripDepartureDateKey))
    if (b.closeDate.closed) set.add(b.closeDate.date)
    else set.delete(b.closeDate.date)
    update.departure_dates_closed = [...set].sort()
  }
  if (b.cutoff) {
    const { date, cutoff } = b.cutoff
    if (!depKeys.has(date)) throw new ApiError('bad_request', 'That date is not a departure for this trip', { field: 'cutoff.date' })
    if (cutoff !== null) {
      if (!Number.isFinite(new Date(`${cutoff}T00:00:00Z`).getTime())) throw new ApiError('bad_request', 'Invalid cutoff date', { field: 'cutoff.cutoff' })
      if (cutoff > date) throw new ApiError('bad_request', 'Cutoff date must be on or before the departure date', { field: 'cutoff.cutoff' })
    }
    const next = { ...((trip.booking_cutoff_dates as Record<string, string> | null) ?? {}) }
    if (cutoff === null) delete next[date]
    else next[date] = cutoff
    update.booking_cutoff_dates = next
  }

  const { error } = await ctx.db.from('packages').update(update).eq('id', id).eq('host_id', user.id)
  if (error) throw error
  revalidateTripPages(id, trip.slug)
  return ok(await loadHostTripSummary(ctx, user.id, id))
})

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * DELETE /host/trips/{id}: same as the web `deleteMyHostedTrip`. Blocked while a departure is running
 * or bookings are active; archived when it has any booking history, else deleted.
 */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = await tripIdOf(params)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const svc = ctx.service()
  const { data: trip, error } = await svc.from('packages')
    .select('id, host_id, slug, departure_dates, return_dates, duration_days, archived_at')
    .eq('id', id).maybeSingle()
  if (error) throw error
  if (!trip || trip.host_id !== user.id || trip.archived_at) throw new ApiError('not_found', 'Trip not found')

  const today = listingScheduleTodayISO()
  if (tripIsRunning(trip, today)) throw new ApiError('conflict', 'This trip is running right now. You can delete it after it ends.')
  const { data: bookings, error: bookingsError } = await svc.from('bookings').select('status, travel_date').eq('package_id', id)
  if (bookingsError) throw bookingsError
  const active = countActiveBookings(bookings ?? [], today, trip.duration_days)
  if (active > 0) throw new ApiError('conflict', `This trip has ${plural(active, 'upcoming booking')}. Cancel them before deleting.`)

  const archive = async () => {
    const { error: e } = await svc.from('packages').update({
      archived_at: new Date().toISOString(),
      is_active: false,
      slug: `${trip.slug || 'trip'}-archived-${Date.now().toString(36)}`,
    }).eq('id', id).eq('host_id', user.id)
    if (e) throw e
    revalidateTripPages(id, trip.slug)
    return ok({ archived: true })
  }
  if ((bookings ?? []).length > 0) return archive()
  const { error: deleteError } = await svc.from('packages').delete().eq('id', id).eq('host_id', user.id)
  if (!deleteError) {
    revalidateTripPages(id, trip.slug)
    return ok({ archived: false })
  }
  if (deleteError.code === '23503') return archive()
  throw deleteError
})
