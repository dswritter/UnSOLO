import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requirePhoneVerified, requireUser } from '@/lib/api/context'
import { ApiError, noContent, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { trackServerEvent } from '@/lib/analytics/server'

type Ctx = { params: Promise<{ id: string }> }

/** Ask to join: requires an intro; expires in 72h; organiser decides (spec §4). */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = await requirePhoneVerified(ctx)
  const { intro } = await parseJson(req, z.object({ intro: z.string().trim().min(10, 'Say a little about yourself (10+ characters)').max(500) }))
  const viewer = await loadViewer(ctx.db, user.id)
  const [post] = await loadPosts(ctx.db, [id], viewer)
  if (!post || post.kind !== 'plan') throw new ApiError('not_found')
  if (post.viewer.membership === 'requested' || post.viewer.membership === 'approved') {
    return ok({ membership: post.viewer.membership, expiresAt: null })
  }
  if (!post.viewer.canJoin) {
    const msg: Record<string, string> = {
      full: 'This plan is full.', women_only: 'This plan is for verified women only.',
      verified_only: 'This plan needs a verified ID.', own_plan: 'This is your plan.',
      phone_required: 'Verify your phone number first.', closed: 'This plan is closed.',
    }
    throw new ApiError(post.viewer.joinBlockedReason === 'phone_required' ? 'phone_required' : 'forbidden', msg[post.viewer.joinBlockedReason ?? 'closed'])
  }
  await enforceRateLimit(ctx, 'join')
  const s = screenText(intro, { allowMoney: true })
  // Re-request after withdraw/expire: replace the row.
  await ctx.service().from('plan_members').delete().eq('post_id', id).eq('user_id', user.id).in('state', ['withdrawn', 'expired'])
  const { data, error } = await ctx.db.from('plan_members').insert({ post_id: id, user_id: user.id, intro: s.text }).select('state, expires_at').single()
  if (error) throw error
  after(async () => {
    await dispatchPendingPushes({ userIds: [post.author.id] })
    await trackServerEvent(ctx, 'plan.join_request', {})
  })
  return ok({ membership: data.state, expiresAt: data.expires_at }, { status: 201 })
})

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('plan_members').update({ state: 'withdrawn' }).eq('post_id', id).eq('user_id', user.id).in('state', ['requested', 'approved'])
  if (error) throw error
  return noContent()
})
