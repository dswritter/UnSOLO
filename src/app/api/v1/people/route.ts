import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { searchPeople } from '@/lib/profile/mentions'

const Q = z.object({ q: z.string().max(60).default(''), limit: z.coerce.number().int().min(1).max(20).default(10) })

/** GET /people?q=: travellers on UnSOLO by name or username (for @mentions and tagging). Signed in only. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const q = parseQuery(req, Q)
  return ok({ items: await searchPeople(ctx.db, q.q, user.id, q.limit) }, { cache: 'private', req })
})
