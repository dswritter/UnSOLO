import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseWith, route, uuid } from '@/lib/api/http'
import { loadOwnedTrip } from '@/lib/host/server'
import { rowToTripForm } from '@/lib/host/trip-form'

type Ctx = { params: Promise<{ id: string }> }

/** GET /host/trips/{id}/form: your trip as a TripForm, to start the edit screen from. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  return ok(rowToTripForm(await loadOwnedTrip(ctx, user.id, id)))
})
