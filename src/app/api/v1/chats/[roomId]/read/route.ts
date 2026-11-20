import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ roomId: string }> }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.rpc('mark_room_messages_read', { p_room_id: roomId, p_user_id: user.id })
  if (error) throw error
  return noContent()
})
