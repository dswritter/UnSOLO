import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { toUserLite } from '@/lib/tribe/models'

/** GET /me/phone-requests: people waiting for your number. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { data, error } = await ctx.db.from('phone_requests')
    .select('id, created_at, requester:profiles!phone_requests_requester_id_fkey(id, username, full_name, avatar_url, is_phone_verified, is_id_verified, is_host)')
    .eq('target_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return ok({ items: (data ?? []).map((r) => ({ id: String(r.id), createdAt: String(r.created_at), user: toUserLite(r.requester as unknown as Record<string, unknown>) })) })
})
