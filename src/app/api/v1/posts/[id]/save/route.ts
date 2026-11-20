import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ id: string }> }

export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('saved_posts').upsert({ user_id: user.id, post_id: id }, { onConflict: 'user_id,post_id', ignoreDuplicates: true })
  if (error) throw error
  return noContent()
})

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await ctx.db.from('saved_posts').delete().eq('user_id', user.id).eq('post_id', id)
  return noContent()
})
