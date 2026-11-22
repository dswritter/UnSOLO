import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { hostAttentionItems, hostUpcomingDepartures, type HostAttentionTrip } from '@/lib/hosting/host-attention'
import { PAYOUT_COLUMNS, loadHostServices, loadHostTrips } from '@/lib/host/server'
import { isPayoutConfigured } from '@/lib/host/shape'
import { todayIST } from '@/lib/tribe/models'

type Row = Record<string, unknown>
type Attention = { kind: 'payout' | 'requests' | 'trip_rejected' | 'listing_rejected'; title: string; body: string; tripId?: string; listingId?: string }

const EMPTY_STATS = { totalTrips: 0, activeTrips: 0, pendingRequests: 0, totalEarnedPaise: 0, pendingPayoutPaise: 0 }

/** GET /host: the host dashboard. Not a host → `isHost:false` and empty lists, so the app can offer "Become a host". */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { data: profile, error } = await ctx.db.from('profiles').select(`is_host, ${PAYOUT_COLUMNS}`).eq('id', user.id).single()
  if (error) throw error
  const payoutConfigured = isPayoutConfigured(profile)
  if (!profile?.is_host) {
    return ok({ isHost: false, payoutConfigured, stats: EMPTY_STATS, attention: [], trips: [], services: [], upcoming: [] })
  }

  const [{ rows, trips }, { services }, earnings] = await Promise.all([
    loadHostTrips(ctx, user.id),
    loadHostServices(ctx, user.id),
    ctx.db.from('host_earnings').select('host_paise, payout_status').eq('host_id', user.id),
  ])
  if (earnings.error) throw earnings.error
  const earned = (earnings.data ?? []) as Row[]

  const attentionTrips: HostAttentionTrip[] = rows.map((r, i) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    moderation_status: (r.moderation_status as string | null) ?? null,
    pending_requests: trips[i].pendingRequests,
    departure_dates: (r.departure_dates as string[] | null) ?? null,
    departure_dates_closed: (r.departure_dates_closed as string[] | null) ?? null,
  }))
  const tripById = new Map(trips.map((t) => [t.id, t]))
  const attention: Attention[] = hostAttentionItems({
    trips: attentionTrips,
    serviceListings: services.map((s) => ({ id: s.id, title: s.title, status: s.status })),
    payoutConfigured,
  }).map((item) => {
    if (item.id === 'payout') return { kind: 'payout', title: 'Set up payout', body: item.text }
    if (item.id.startsWith('req-')) {
      const t = tripById.get(item.id.slice(4))
      const n = t?.pendingRequests ?? 0
      return { kind: 'requests', title: `${n} join request${n === 1 ? '' : 's'} waiting`, body: item.text, tripId: item.id.slice(4) }
    }
    if (item.id.startsWith('rej-')) return { kind: 'trip_rejected', title: 'Trip needs changes', body: item.text, tripId: item.id.slice(4) }
    return { kind: 'listing_rejected', title: 'Listing needs changes', body: item.text, listingId: item.id.slice(4) }
  })

  const upcoming = hostUpcomingDepartures(attentionTrips, todayIST(), 5).map((d) => {
    const t = tripById.get(d.tripId)
    return {
      tripId: d.tripId,
      title: d.title,
      date: d.date,
      booked: t?.departures.find((x) => x.date === d.date)?.booked ?? 0,
      maxGroupSize: t?.maxGroupSize ?? 0,
    }
  })

  return ok({
    isHost: true,
    payoutConfigured,
    stats: {
      totalTrips: trips.length,
      activeTrips: trips.filter((t) => t.isActive).length,
      pendingRequests: trips.reduce((n, t) => n + t.pendingRequests, 0),
      totalEarnedPaise: earned.reduce((n, e) => n + Number(e.host_paise ?? 0), 0),
      pendingPayoutPaise: earned.filter((e) => e.payout_status === 'pending').reduce((n, e) => n + Number(e.host_paise ?? 0), 0),
    },
    attention,
    trips,
    services,
    upcoming,
  })
})
