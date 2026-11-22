import { getApiContext } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { INTEREST_TAGS } from '@/lib/constants'
import { getTripFormBootstrap } from '@/lib/hosting/trip-form-bootstrap'
import { requireHost } from '@/lib/host/server'

/** GET /host/form-options: option lists and limits for the trip form. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  await requireHost(ctx)
  const b = await getTripFormBootstrap()
  return ok({
    destinations: b.destinations.map((d) => ({ id: d.id, name: d.name, state: d.state })),
    includes: b.includesOptions.map((o) => o.label),
    interestTags: [...INTEREST_TAGS],
    maxGroupSize: b.maxGroupSize,
    platformFeePercent: b.platformFeePercent,
  })
})
