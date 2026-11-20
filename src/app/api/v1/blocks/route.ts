import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, noContent, parseJson, route } from '@/lib/api/http'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { userId } = await parseJson(req, z.object({ userId: z.string().uuid() }))
  if (userId === user.id) throw new ApiError('bad_request', 'You cannot block yourself')
  const { error } = await ctx.db.from('user_blocks').upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })
  if (error) throw error
  // Blocking also unfollows both ways and separates you in plans: their requests to your plans and
  // yours to theirs are withdrawn; they're removed from plans you organise and you leave theirs
  // (sync_plan_chat drops the matching plan-chat memberships). DMs are refused by RLS from now on.
  const svc = ctx.service()
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    svc.from('posts').select('id').eq('author_id', user.id).eq('kind', 'plan'),
    svc.from('posts').select('id').eq('author_id', userId).eq('kind', 'plan'),
  ])
  const myPlans = (mine ?? []).map((p) => p.id as string), theirPlans = (theirs ?? []).map((p) => p.id as string)
  await Promise.all([
    svc.from('follows').delete().or(`and(follower_id.eq.${user.id},following_id.eq.${userId}),and(follower_id.eq.${userId},following_id.eq.${user.id})`),
    myPlans.length ? svc.from('plan_members').update({ state: 'withdrawn' }).eq('user_id', userId).eq('state', 'requested').in('post_id', myPlans) : null,
    myPlans.length ? svc.from('plan_members').update({ state: 'removed' }).eq('user_id', userId).eq('state', 'approved').eq('role', 'member').in('post_id', myPlans) : null,
    theirPlans.length ? svc.from('plan_members').update({ state: 'withdrawn' }).eq('user_id', user.id).in('state', ['requested', 'approved']).eq('role', 'member').in('post_id', theirPlans) : null,
  ])
  return noContent()
})
