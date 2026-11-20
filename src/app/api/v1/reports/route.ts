import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'

const Body = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'message']),
  targetId: z.string().uuid(),
  reason: z.enum(['spam', 'scam_money', 'harassment', 'unsafe_meetup', 'fake_profile', 'hate', 'sexual', 'other']),
  details: z.string().trim().max(1000).optional(),
})

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  const { data: existing } = await ctx.db.from('reports').select('id').eq('reporter_id', user.id).eq('target_type', b.targetType).eq('target_id', b.targetId).maybeSingle()
  if (existing) return ok({ id: existing.id })
  await enforceRateLimit(ctx, 'report')
  const { data, error } = await ctx.db.from('reports').insert({
    reporter_id: user.id, target_type: b.targetType, target_id: b.targetId, reason: b.reason, details: b.details ?? null,
  }).select('id').single()
  if (error) throw error
  return ok({ id: data.id }, { status: 201 })
})
