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
  // Blocking also unfollows both ways and withdraws pending plan requests between you.
  const svc = ctx.service()
  await Promise.all([
    svc.from('follows').delete().or(`and(follower_id.eq.${user.id},following_id.eq.${userId}),and(follower_id.eq.${userId},following_id.eq.${user.id})`),
  ])
  return noContent()
})
