import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, noContent, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ id: string }> }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  requireUser(ctx)
  const { data, error } = await ctx.db.from('host_offers').update({ state: 'declined' }).eq('id', id).eq('state', 'pending').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError('not_found', 'This offer is no longer open')
  return noContent()
})
