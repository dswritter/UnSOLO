import { z } from 'zod'
import { getApiContext, requireVerifiedContact } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'

type Ctx = { params: Promise<{ username: string }> }

/** POST /users/{username}/phone-request: ask for their number (they approve in the app or on the web). */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const username = parseWith(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), (await params).username)
  const ctx = await getApiContext(req)
  const user = await requireVerifiedContact(ctx)
  const { data: t } = await ctx.db.from('profiles').select('id').eq('username', username).maybeSingle()
  if (!t) throw new ApiError('not_found', 'No traveller with that name')
  if (t.id === user.id) throw new ApiError('bad_request', 'That’s your own number')
  await enforceRateLimit(ctx, 'join')
  const { error } = await ctx.db.from('phone_requests').upsert(
    { requester_id: user.id, target_id: t.id, status: 'pending', updated_at: new Date().toISOString() },
    { onConflict: 'requester_id,target_id' },
  )
  if (error) throw error
  await ctx.service().rpc('create_notification', {
    p_user_id: t.id, p_type: 'phone_request', p_title: 'Phone number request',
    p_body: 'Someone asked for your phone number', p_link: '/profile',
  })
  return ok({ request: 'pending' }, { status: 201 })
})
