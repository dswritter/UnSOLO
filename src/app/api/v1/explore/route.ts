import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'
import { loadUpcomingTrips } from '@/lib/tribe/trips'

const Q = z.object({
  q: z.string().max(80).optional(),
  category: z.enum(['trips', 'stays', 'activities', 'rentals']).default('trips'),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
})

/** Hosted, bookable departures sorted by date. Stays/activities/rentals: see /hosts/[kind] (phase 2). */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const q = parseQuery(req, Q)
  if (q.category !== 'trips') return ok({ items: [], nextCursor: null }, { cache: ctx.user ? 'private' : 'public', req })
  const offset = decodeCursor(q.cursor)?.offset ?? 0
  const { items, hasMore } = await loadUpcomingTrips(ctx, { q: q.q, month: q.month, limit: q.limit, offset })
  return ok({ items, nextCursor: hasMore ? encodeCursor({ offset: offset + q.limit }) : null }, { cache: ctx.user ? 'private' : 'public', req })
})
