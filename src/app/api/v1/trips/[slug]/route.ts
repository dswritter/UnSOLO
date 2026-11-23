import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'
import { loadPosts, loadTripOccupancy, loadViewer } from '@/lib/tribe/load'
import { PACKAGE_LITE, PROFILE_LITE, mediaFromUrl, toTripLite, toUserLite, todayIST, placeSlug, type Seat } from '@/lib/tribe/models'
import { countPlanning } from '@/lib/tribe/trips'
import { loadListingDetail } from '@/lib/tribe/listings'

type Ctx = { params: Promise<{ slug: string }> }

/** A hosted trip, or (same shape, kind set) a stay, activity or rental with this slug. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const slug = parseWith(z.string().regex(/^[a-z0-9-]{1,120}$/), (await params).slug)
  const ctx = await getApiContext(req)
  const { data: r } = await ctx.db.from('packages')
    .select(`${PACKAGE_LITE}, description, short_description, includes`)
    .eq('slug', slug).eq('is_active', true).maybeSingle()
  if (!r) return ok(await loadListingDetail(ctx, slug), { cache: ctx.user ? 'private' : 'public', req })
  const row = r as Record<string, unknown>
  const today = todayIST()
  const dates = ((row.departure_dates as string[] | null) ?? []).filter((d) => d >= today).sort().slice(0, 8)
  const svc = ctx.service()
  const [{ data: booked }, host, storiesRes, ratingRes] = await Promise.all([
    svc.from('bookings').select('travel_date, guests').eq('package_id', row.id).in('travel_date', dates.length ? dates : ['1970-01-01']).in('status', ['pending', 'confirmed', 'completed']),
    row.host_id ? ctx.db.from('profiles').select(PROFILE_LITE).eq('id', row.host_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from('posts').select('id').eq('trip_package_id', row.id).eq('kind', 'story').eq('status', 'live').eq('show_on_trip_page', true).order('created_at', { ascending: false }).limit(6),
    svc.from('reviews').select(`id, rating, rating_destination, rating_experience, title, body, images, created_at, author:profiles!reviews_user_id_fkey(${PROFILE_LITE})`).eq('package_id', row.id).eq('status', 'approved').order('created_at', { ascending: false }).limit(200),
  ])
  const per = new Map<string, number>()
  for (const b of booked ?? []) per.set(b.travel_date as string, (per.get(b.travel_date as string) ?? 0) + Number(b.guests ?? 1))
  const total = Number(row.max_group_size ?? 12)
  const occ = await loadTripOccupancy(svc, [{ id: String(row.id), nextDeparture: dates[0] ?? null }], !!ctx.user)
  const o = occ.get(String(row.id))
  const hostUser = host.data ? toUserLite(host.data as Record<string, unknown>) : null
  const seats: Seat[] = []
  if (hostUser) seats.push({ state: 'host', user: hostUser })
  for (const f of o?.faces ?? []) seats.push({ state: f.id === ctx.user?.id ? 'you' : 'member', user: ctx.user ? f : null })
  const takenAnon = Math.max((o?.booked ?? 0) - (o?.faces.length ?? 0), 0)
  for (let i = 0; i < takenAnon; i++) seats.push({ state: 'member', user: null })
  while (seats.length < total + (hostUser ? 1 : 0)) seats.push({ state: 'open', user: null })
  const ratingRows = (ratingRes.data ?? []) as Record<string, unknown>[]
  const ratings = ratingRows.map((x) => Number(x.rating)).filter(Boolean)
  const avgOf = (k: string) => {
    const v = ratingRows.map((x) => Number(x[k] ?? x.rating)).filter(Boolean)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }
  const viewer = await loadViewer(ctx.db, ctx.user)
  const lite = toTripLite(row, { booked: o?.booked ?? 0, host: hostUser, goingFaces: (o?.faces ?? []).slice(0, 5) })
  const planning = await countPlanning(ctx.db, lite.place?.slug ?? placeSlug(lite.place?.name))
  return ok({
    ...lite,
    description: String(row.description ?? ''),
    includes: (row.includes as string[] | null) ?? [],
    images: ((row.images as string[] | null) ?? []).map((u) => mediaFromUrl(u)!).filter(Boolean),
    departures: dates.map((d) => ({ date: d, seatsTotal: total, seatsLeft: Math.max(total - (per.get(d) ?? 0), 0) })),
    seats,
    rating: { avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, count: ratings.length,
      destination: avgOf('rating_destination'), experience: avgOf('rating_experience') },
    stories: await loadPosts(ctx.db, (storiesRes.data ?? []).map((s) => s.id as string), viewer),
    planningCount: planning >= 3 ? planning : 0,
    // Latest reviews: written ones first, then those with photos, then star-only ones.
    reviews: ratingRows
      .map((x, i) => ({ x, i, w: (x.body || x.title ? 2 : 0) + ((x.images as string[] | null)?.length ? 1 : 0) }))
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .map(({ x }) => x)
      .slice(0, 10)
      .map((x) => ({ id: String(x.id), rating: Number(x.rating ?? 0), title: (x.title as string | null) ?? null, body: (x.body as string | null) ?? null,
        photos: ((x.images as string[] | null) ?? []).map((u) => mediaFromUrl(u)).filter(Boolean), createdAt: x.created_at, author: toUserLite(x.author as Record<string, unknown>) })),
  }, { cache: ctx.user ? 'private' : 'public', req })
})
