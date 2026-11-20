import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('post_comments').delete().eq('id', id).eq('author_id', user.id)
  if (error) throw error
  return noContent()
})
