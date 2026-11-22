import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ id: string }> }

/** DELETE /statuses/{id}: remove one of your statuses now. */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = await requireUser(ctx)
  const { data, error } = await ctx.db.from('status_stories').delete().eq('id', id).eq('author_id', user.id).select('id')
  if (error) throw error
  if (!data?.length) throw new ApiError('not_found', 'That story is already gone')
  return ok({ ok: true })
})
