import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'
import { loadPlacedTrips } from '@/lib/tribe/trips'

const Q = z.object({
  kind: z.enum(['plan', 'story', 'ask']).optional(),
  place: z.string().max(60).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
})

/** Ranked Tribe feed (tribe_feed RPC) with ~1 in 8 placed "HOSTED TRIP · BOOKABLE" cards. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const q = parseQuery(req, Q)
  const c = decodeCursor(q.cursor)
  const { data, error } = await ctx.db.rpc('tribe_feed', {
    p_kind: q.kind ?? null, p_place: q.place ?? null,
    p_lat: q.lat != null ? Math.round(q.lat * 100) / 100 : null,
    p_lng: q.lng != null ? Math.round(q.lng * 100) / 100 : null,
    p_before_score: c?.score ?? null, p_before_id: c?.id ?? null, p_limit: q.limit,
  })
  if (error) throw error
  const rows = (data ?? []) as { post_id: string; score: number }[]
  const viewer = await loadViewer(ctx.db, ctx.user?.id)
  const posts = await loadPosts(ctx.db, rows.map((r) => r.post_id), viewer)
  const caughtUp = rows.length < q.limit
  const placedCount = q.kind ? 0 : Math.floor(posts.length / 8) + (caughtUp ? 0 : 0)
  const trips = placedCount > 0 || caughtUp ? await loadPlacedTrips(ctx, Math.max(placedCount, caughtUp ? 3 : 0)) : []
  const items: unknown[] = []
  let t = 0
  posts.forEach((p, i) => {
    items.push(p)
    if (!q.kind && (i + 1) % 7 === 0 && t < placedCount && trips[t]) items.push({ kind: 'placed_trip', trip: trips[t++] })
  })
  const last = rows[rows.length - 1]
  return ok({
    items,
    nextCursor: caughtUp || !last ? null : encodeCursor({ score: last.score, id: last.post_id }),
    caughtUp,
    nextDepartures: caughtUp ? trips.slice(t, t + 3) : [],
  })
})
