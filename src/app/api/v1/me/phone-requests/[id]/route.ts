import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'

type Ctx = { params: Promise<{ id: string }> }
const Body = z.object({ approve: z.boolean() })

/** PUT /me/phone-requests/{id} { approve }: share your number with them, or decline. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { approve } = await parseJson(req, Body)
  const { data, error } = await ctx.db.from('phone_requests')
    .update({ status: approve ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
    .eq('id', id).eq('target_id', user.id).select('id')
  if (error) throw error
  if (!data?.length) throw new ApiError('not_found', 'That request is gone')
  return ok({ status: approve ? 'approved' : 'rejected' })
})
