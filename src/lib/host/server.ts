/** Data access for the native Host API (docs/revamp/api-v1-host.md). Route handlers only. */
import { revalidatePath } from 'next/cache'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/http'
import { requireUser, type ApiContext } from '@/lib/api/context'
import { fetchCommunityTripBookingCountsForPackages } from '@/lib/community-trip-booking-stats'
import { fetchServiceBookingCountsForListings } from '@/lib/service-listing-booking-stats'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { todayIST } from '@/lib/tribe/models'
import { HOST_SERVICE_SELECT, HOST_TRIP_SELECT, toHostServiceSummary, toHostTripSummary, type HostServiceSummary, type HostTripSummary } from './shape'

type Row = Record<string, unknown>

/** Public prefix of the `images` bucket; POST /uploads stores photos here. */
export const storagePrefix = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/images/`

export const PAYOUT_COLUMNS = 'payout_method, upi_id, bank_account_name, bank_account_number, bank_ifsc'

/** Signed in and `profiles.is_host = true`, else 403 "Host verification required". */
export async function requireHost(ctx: ApiContext): Promise<User> {
  const user = requireUser(ctx)
  const { data, error } = await ctx.db.from('profiles').select('is_host').eq('id', user.id).single()
  if (error && error.code !== 'PGRST116') throw error
  if (!data?.is_host) throw new ApiError('forbidden', 'Host verification required')
  return user
}

/** Your trip (not archived), with every column, or 404. */
export async function loadOwnedTrip(ctx: ApiContext, userId: string, tripId: string): Promise<Row> {
  const { data, error } = await ctx.db.from('packages').select('*').eq('id', tripId).eq('host_id', userId).is('archived_at', null).maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError('not_found', 'Trip not found')
  return data as Row
}

/**
 * Your trips (not archived, newest first) as HostTripSummary. Request counts use your client
 * (hosts can read requests on their trips); booking counts and seats per date use the service role.
 */
export async function loadHostTrips(ctx: ApiContext, userId: string, opts: { ids?: string[] } = {}): Promise<{ rows: Row[]; trips: HostTripSummary[] }> {
  let q = ctx.db.from('packages').select(HOST_TRIP_SELECT).eq('host_id', userId).is('archived_at', null).order('created_at', { ascending: false })
  if (opts.ids) q = q.in('id', opts.ids)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const ids = rows.map((r) => String(r.id))
  if (!ids.length) return { rows, trips: [] }
  const today = todayIST()
  const svc = ctx.service()
  const [requests, bookingCounts, seats] = await Promise.all([
    ctx.db.from('join_requests').select('trip_id, status').in('trip_id', ids).in('status', ['pending', 'approved']),
    fetchCommunityTripBookingCountsForPackages(svc, ids),
    svc.from('bookings').select('package_id, travel_date, guests').in('package_id', ids).gte('travel_date', today).in('status', ['pending', 'confirmed', 'completed']),
  ])
  if (requests.error) throw requests.error
  if (seats.error) throw seats.error
  const counts = new Map<string, { pending: number; approved: number }>()
  for (const r of (requests.data ?? []) as Row[]) {
    const c = counts.get(String(r.trip_id)) ?? { pending: 0, approved: 0 }
    if (r.status === 'pending') c.pending++
    else c.approved++
    counts.set(String(r.trip_id), c)
  }
  const booked = new Map<string, Map<string, number>>()
  for (const b of (seats.data ?? []) as Row[]) {
    const per = booked.get(String(b.package_id)) ?? new Map<string, number>()
    const d = tripDepartureDateKey(String(b.travel_date))
    per.set(d, (per.get(d) ?? 0) + Number(b.guests ?? 1))
    booked.set(String(b.package_id), per)
  }
  const trips = rows.map((r) => {
    const id = String(r.id)
    return toHostTripSummary(r, {
      today,
      booked: booked.get(id),
      pendingRequests: counts.get(id)?.pending ?? 0,
      approvedRequests: counts.get(id)?.approved ?? 0,
      bookingCount: bookingCounts[id] ?? 0,
    })
  })
  return { rows, trips }
}

export async function loadHostTripSummary(ctx: ApiContext, userId: string, tripId: string): Promise<HostTripSummary> {
  const { trips } = await loadHostTrips(ctx, userId, { ids: [tripId] })
  if (!trips[0]) throw new ApiError('not_found', 'Trip not found')
  return trips[0]
}

/** Your stays, activities and rentals (not archived) as HostServiceSummary. */
export async function loadHostServices(ctx: ApiContext, userId: string, opts: { ids?: string[] } = {}): Promise<{ rows: Row[]; services: HostServiceSummary[] }> {
  let q = ctx.db.from('service_listings').select(HOST_SERVICE_SELECT).eq('host_id', userId).is('archived_at', null).order('created_at', { ascending: false })
  if (opts.ids) q = q.in('id', opts.ids)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const ids = rows.map((r) => String(r.id))
  if (!ids.length) return { rows, services: [] }
  const [items, counts] = await Promise.all([
    ctx.db.from('service_listing_items').select('service_listing_id').in('service_listing_id', ids),
    fetchServiceBookingCountsForListings(ctx.service(), ids),
  ])
  // Best effort, like the web dashboard: no item counts if the items table is missing.
  const itemCount = new Map<string, number>()
  for (const r of (items.error ? [] : items.data ?? []) as Row[]) {
    itemCount.set(String(r.service_listing_id), (itemCount.get(String(r.service_listing_id)) ?? 0) + 1)
  }
  return {
    rows,
    services: rows.map((r) => toHostServiceSummary(r, { itemCount: itemCount.get(String(r.id)) ?? 0, bookingCount: counts.byListingId[String(r.id)] ?? 0 })),
  }
}

export async function hostDisplayName(db: SupabaseClient, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('full_name, username').eq('id', userId).single()
  return String(data?.full_name || data?.username || 'A host')
}

/** Same as the web hosting actions: every `role = admin` profile gets a notification row. */
export async function notifyAdmins(svc: SupabaseClient, n: { title: string; body: string; link?: string }) {
  const { data: admins, error } = await svc.from('profiles').select('id').in('role', ['admin'])
  if (error) {
    console.error('[api/v1/host] admin lookup failed', error.message)
    return
  }
  if (!admins?.length) return
  const { error: insertError } = await svc.from('notifications').insert(
    admins.map((a) => ({ user_id: a.id, type: 'booking', title: n.title, body: n.body, link: n.link ?? '/admin/community-trips' })),
  )
  if (insertError) console.error('[api/v1/host] admin notification failed', insertError.message)
}

/** Platform host_max_group_size (default 50), read fresh so the limit applies right after a change. */
export async function platformMaxGroupSize(svc: SupabaseClient): Promise<number> {
  const { data } = await svc.from('platform_settings').select('value').eq('key', 'host_max_group_size').maybeSingle()
  return parseInt(String(data?.value ?? ''), 10) || 50
}

/** Escapes LIKE wildcards so `ilike` is an exact, case-insensitive match. */
export function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Web pages that show this trip (same paths the web hosting actions revalidate). */
export function revalidateTripPages(tripId: string, slug?: unknown) {
  try {
    revalidatePath('/host')
    revalidatePath('/')
    revalidatePath(`/host/${tripId}`)
    if (typeof slug === 'string' && slug) revalidatePath(`/packages/${slug}`)
  } catch (e) {
    console.warn('[api/v1/host] revalidate failed', (e as Error)?.message)
  }
}
