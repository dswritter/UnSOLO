import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ userId: string }> }

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const userId = parseWith(uuid, (await params).userId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await ctx.db.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId)
  return noContent()
})
