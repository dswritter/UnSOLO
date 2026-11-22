import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { findBuddies } from '@/lib/trips/buddies'

/** GET /buddies: people to travel with (same departure, same place and dates, same saved trips), best first, with why. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  return ok({ items: await findBuddies(ctx.service(), user.id) }, { cache: 'private', req })
})
