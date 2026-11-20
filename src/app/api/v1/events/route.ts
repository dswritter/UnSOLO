import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ApiError, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { NextResponse } from 'next/server'

const Event = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/),
  screen: z.string().max(80).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  ts: z.string().datetime({ offset: true }).optional(),
  anonId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
})

/** Batched analytics ingestion (≤50 per call). Public: signed-out traffic counts too. */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req).catch(async () => getApiContext(new Request(req.url, { headers: { 'x-unsolo-client': req.headers.get('x-unsolo-client') ?? '' } })))
  const { events } = await parseJson(req, z.object({ events: z.array(Event).min(1).max(50) }))
  const subject = ctx.user?.id ?? events[0]?.anonId ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  await enforceRateLimit({ ...ctx, user: ctx.user ?? ({ id: subject, created_at: new Date(0).toISOString() } as never) }, 'events', subject)
  const now = Date.now()
  const rows = events.map((e) => {
    const props = e.props ?? {}
    if (JSON.stringify(props).length > 4000) throw new ApiError('bad_request', 'props too large')
    const ts = e.ts && Math.abs(Date.parse(e.ts) - now) < 7 * 86400_000 ? e.ts : new Date().toISOString()
    return {
      user_id: ctx.user?.id ?? null, anon_id: e.anonId ?? null, session_id: e.sessionId ?? null,
      name: e.name, screen: e.screen ?? null, platform: ctx.client.platform, app_version: ctx.client.version,
      props, ts,
    }
  })
  const { error } = await ctx.service().from('analytics_events').insert(rows)
  if (error) console.warn('[events] insert failed', error.message)
  return new NextResponse(null, { status: 202 })
})
