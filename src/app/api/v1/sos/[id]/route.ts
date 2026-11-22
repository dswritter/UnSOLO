import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { mapLink, notify, staffIds } from '@/lib/trips/safety'

type Ctx = { params: Promise<{ id: string }> }
const Body = z.object({
  /** "safe" = I'm OK now (closes it); omit to just send a newer location. */
  status: z.enum(['safe']).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(100_000).optional(),
})

/** PUT /sos/{id}: a newer location for an open alert, or "I'm safe" (the team is told). */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(z.string().uuid(), (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  await enforceRateLimit(ctx, 'location')
  const svc = ctx.service()
  const { data: a } = await svc.from('sos_alerts').select('id, user_id, status').eq('id', id).maybeSingle()
  if (!a || a.user_id !== user.id) throw new ApiError('not_found', 'Alert not found')
  const patch: Record<string, unknown> = {}
  if (b.lat != null && b.lng != null) Object.assign(patch, { lat: b.lat, lng: b.lng, accuracy_m: b.accuracy ?? null })
  if (b.status === 'safe' && a.status === 'open') Object.assign(patch, { status: 'cancelled', resolved_at: new Date().toISOString(), resolved_by: user.id })
  if (Object.keys(patch).length) await svc.from('sos_alerts').update(patch).eq('id', id)
  if (b.status === 'safe' && a.status === 'open') {
    const { data: me } = await svc.from('profiles').select('full_name, username').eq('id', user.id).single()
    await notify(svc, await staffIds(svc), { type: 'sos', title: `${me?.full_name || me?.username || 'The traveller'} says they're safe`, body: 'The SOS was closed by the traveller.', link: '/admin', metadata: { sos_id: id } })
  }
  return ok({ id, status: b.status === 'safe' ? 'cancelled' : a.status, map: b.lat != null && b.lng != null ? mapLink(b.lat, b.lng) : null })
})
