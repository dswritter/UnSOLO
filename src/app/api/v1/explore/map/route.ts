import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { loadServiceListings } from '@/lib/tribe/listings'
import { loadUpcomingTrips } from '@/lib/tribe/trips'
import { mediaFromUrl, todayIST } from '@/lib/tribe/models'
import { geocodeMissingDestinations } from '@/lib/trips/geocode'

type Row = Record<string, unknown>
const Q = z.object({ category: z.enum(['all', 'trips', 'stays', 'activities', 'rentals', 'plans']).default('all') })

/**
 * GET /explore/map?category=: pins for the Explore map. Trips sit on their destination, stays,
 * activities and rentals on their own spot, open plans on their place. OpenStreetMap tiles on the clients.
 */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const { category } = parseQuery(req, Q)
  const want = (c: string) => category === 'all' || category === c
  const svc = ctx.service()
  const pins: Record<string, unknown>[] = []

  if (want('trips')) {
    // Trips whose dates have all passed show too (greyed in the apps; hosts add dates on request).
    const trips = await loadUpcomingTrips(ctx, { limit: 200, includeUndated: true })
    const { data: dests } = await svc.from('destinations').select('slug, lat, lng').not('lat', 'is', null)
    const at = new Map(((dests ?? []) as Row[]).map((d) => [String(d.slug), { lat: Number(d.lat), lng: Number(d.lng) }]))
    for (const t of trips.items) {
      const p = at.get(t.place?.slug ?? '')
      if (p) pins.push({ kind: 'trip', id: t.id, slug: t.slug, title: t.title, place: t.place?.name ?? null, lat: p.lat, lng: p.lng,
        priceFromPaise: t.priceFromPaise, date: t.nextDeparture, seatsLeft: t.nextDeparture ? t.seatsLeft : null, past: !t.nextDeparture, image: t.image })
    }
    // Fill in a few missing destinations after we answer (next request has them).
    if (trips.items.some((t) => t.place?.slug && !at.has(t.place.slug))) after(() => geocodeMissingDestinations(svc, 5).then(() => undefined))
  }
  for (const c of ['stays', 'activities', 'rentals'] as const) {
    if (!want(c)) continue
    const { items } = await loadServiceListings(ctx, c, { limit: 100 })
    for (const t of items) if (t.place?.lat != null && t.place?.lng != null) {
      pins.push({ kind: ({ stays: 'stay', activities: 'activity', rentals: 'rental' } as const)[c], id: t.id, slug: t.slug, title: t.title, place: t.place.name, lat: t.place.lat, lng: t.place.lng,
        priceFromPaise: t.priceFromPaise, unit: t.unit ?? null, image: t.image })
    }
  }
  if (want('plans')) {
    const { data } = await ctx.db.from('posts').select('id, title, place_name, lat, lng, starts_on, spots_total, member_count, media:post_media(url, position)')
      .eq('kind', 'plan').eq('status', 'live').gte('starts_on', todayIST()).not('lat', 'is', null).limit(150)
    for (const p of (data ?? []) as Row[]) {
      const m = ((p.media as Row[] | null) ?? []).sort((a, b) => Number(a.position) - Number(b.position))[0]
      pins.push({ kind: 'plan', id: p.id, postId: p.id, title: p.title ?? `Plan: ${p.place_name}`, place: p.place_name, lat: Number(p.lat), lng: Number(p.lng),
        date: p.starts_on, spotsLeft: Math.max(Number(p.spots_total ?? 0) - Number(p.member_count ?? 0), 0), image: m ? mediaFromUrl(String(m.url)) : null })
    }
  }
  return ok({ pins }, { cache: ctx.user ? 'private' : 'public', req })
})
