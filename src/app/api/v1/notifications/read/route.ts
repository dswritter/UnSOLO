import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseJson, route } from '@/lib/api/http'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }))
  let q = ctx.db.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
  if (!b.all) q = q.in('id', b.ids ?? [])
  const { error } = await q
  if (error) throw error
  return noContent()
})
