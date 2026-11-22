import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiContext } from '@/lib/api/context'
import { PACKAGE_LITE, PROFILE_LITE, nextDeparture, toTripLite, toUserLite, todayIST, type TripLite } from './models'
import { loadTripOccupancy } from './load'

type Row = Record<string, unknown>

/** Active packages with an upcoming departure, sorted by next departure, with seat counts. */
export async function loadUpcomingTrips(
  ctx: Pick<ApiContext, 'db' | 'service' | 'user'>,
  opts: { q?: string; month?: string; limit?: number; offset?: number; ids?: string[]; includeUndated?: boolean } = {},
): Promise<{ items: TripLite[]; hasMore: boolean }> {
  let query = ctx.db.from('packages').select(PACKAGE_LITE).eq('is_active', true)
    .or('moderation_status.is.null,moderation_status.eq.approved')
  if (opts.ids) query = query.in('id', opts.ids)
  if (opts.q) {
    const term = opts.q.replace(/[%_,()]/g, ' ').trim().slice(0, 60)
    if (term) query = query.or(`title.ilike.%${term}%,short_description.ilike.%${term}%`)
  }
  const { data, error } = await query.limit(400)
  if (error) throw error
  const today = todayIST()
  const all = ((data ?? []) as Row[]).map((r) => ({ r, next: nextDeparture(r.departure_dates) }))
  let rows = all.filter((x) => x.next && x.next >= today)
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    rows = rows.filter((x) => (x.r.departure_dates as string[]).some((d) => d.startsWith(opts.month!)))
  }
  rows.sort((a, b) => a.next!.localeCompare(b.next!))
  // Explore also lists trips whose dates have all passed (hosts add new ones on request), after the dated ones.
  if (opts.includeUndated && !opts.month) {
    rows = [...rows, ...all.filter((x) => !x.next || x.next < today)
      .sort((a, b) => String(b.r.created_at ?? '').localeCompare(String(a.r.created_at ?? ''))).map((x) => ({ r: x.r, next: null }))]
  }
  const offset = opts.offset ?? 0, limit = opts.limit ?? 20
  const page = rows.slice(offset, offset + limit)
  const hostIds = [...new Set(page.map((x) => x.r.host_id).filter(Boolean) as string[])]
  const [occ, hosts] = await Promise.all([
    loadTripOccupancy(ctx.service(), page.map((x) => ({ id: String(x.r.id), nextDeparture: x.next })), !!ctx.user),
    hostIds.length ? ctx.db.from('profiles').select(PROFILE_LITE).in('id', hostIds) : Promise.resolve({ data: [] as Row[] }),
  ])
  const hostBy = new Map(((hosts.data ?? []) as Row[]).map((h) => [String(h.id), toUserLite(h)]))
  return {
    items: page.map(({ r }) => {
      const o = occ.get(String(r.id))
      return toTripLite(r, { booked: o?.booked ?? 0, host: r.host_id ? hostBy.get(String(r.host_id)) ?? null : null, goingFaces: (o?.faces ?? []).slice(0, 5) })
    }),
    hasMore: rows.length > offset + limit,
  }
}

/** UnSOLO-placed "HOSTED TRIP · BOOKABLE" cards for the feed (~1 in 8), soonest departures first. */
export async function loadPlacedTrips(ctx: Pick<ApiContext, 'db' | 'service' | 'user'>, n: number): Promise<TripLite[]> {
  if (n <= 0) return []
  return (await loadUpcomingTrips(ctx, { limit: n })).items
}

export async function countPlanning(db: SupabaseClient, placeSlug: string | null): Promise<number> {
  if (!placeSlug) return 0
  const { count } = await db.from('posts').select('id', { count: 'exact', head: true })
    .eq('kind', 'plan').eq('status', 'live').eq('place_slug', placeSlug)
  return count ?? 0
}

export { PROFILE_LITE }
