import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { loadUpcomingTrips } from '@/lib/tribe/trips'

const Q = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() })

/** Plans + departures suggested by location (opt-in), interests, dates and (opt-in) gender. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const q = parseQuery(req, Q)
  const r2 = (v?: number) => (v == null ? null : Math.round(v * 100) / 100)
  const { data, error } = await ctx.db.rpc('suggest_for_user', { p_lat: r2(q.lat), p_lng: r2(q.lng), p_limit: 12 })
  if (error) throw error
  const rows = (data ?? []) as { item_type: string; item_id: string; reason: string }[]
  const viewer = await loadViewer(ctx.db, ctx.user?.id)
  const [posts, trips] = await Promise.all([
    loadPosts(ctx.db, rows.filter((r) => r.item_type === 'plan').map((r) => r.item_id), viewer),
    loadUpcomingTrips(ctx, { ids: rows.filter((r) => r.item_type === 'trip').map((r) => r.item_id), limit: 12 }),
  ])
  const postBy = new Map(posts.map((p) => [p.id, p])), tripBy = new Map(trips.items.map((t) => [t.id, t]))
  const items = rows.map((r) => r.item_type === 'plan'
    ? (postBy.get(r.item_id) ? { type: 'plan', reason: r.reason, post: postBy.get(r.item_id) } : null)
    : (tripBy.get(r.item_id) ? { type: 'trip', reason: r.reason, trip: tripBy.get(r.item_id) } : null)).filter(Boolean)
  return ok({ items })
})
