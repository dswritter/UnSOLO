import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { userId } = await parseJson(req, z.object({ userId: z.string().uuid() }))
  const { data, error } = await ctx.db.rpc('get_or_create_dm_room', { user_a: user.id, user_b: userId })
  if (error) throw error
  return ok({ roomId: data })
})
