import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { trackServerEvent } from '@/lib/analytics/server'

type Ctx = { params: Promise<{ id: string; userId: string }> }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const p = await params
  const id = parseWith(uuid, p.id), userId = parseWith(uuid, p.userId)
  const ctx = await getApiContext(req)
  requireUser(ctx)
  const { decision } = await parseJson(req, z.object({ decision: z.enum(['approve', 'decline']) }))
  const state = decision === 'approve' ? 'approved' : 'declined'
  const { data, error } = await ctx.db.from('plan_members').update({ state }).eq('post_id', id).eq('user_id', userId).eq('state', 'requested').select('state').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError('not_found', 'This request is no longer pending')
  after(async () => {
    await dispatchPendingPushes({ userIds: [userId] })
    if (decision === 'approve') await trackServerEvent(ctx, 'plan.approve', {})
  })
  return ok({ state: data.state })
})
