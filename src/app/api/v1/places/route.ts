import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { suggestPlaces } from '@/lib/tribe/places'

const Q = z.object({ q: z.string().max(80).default(''), limit: z.coerce.number().int().min(1).max(12).default(8) })

/** GET /places?q=: suggestions for the place field in plans, stories and questions. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const q = parseQuery(req, Q)
  return ok({ items: await suggestPlaces(ctx.db, q.q, q.limit) }, { cache: 'public', req })
})
