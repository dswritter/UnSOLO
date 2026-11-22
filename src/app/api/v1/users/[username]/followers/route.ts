import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'

type Ctx = { params: Promise<{ username: string }> }

/** GET /users/{username}/followers: up to 200 people, newest first. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const username = parseWith(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), (await params).username)
  const ctx = await getApiContext(req)
  const { data: p } = await ctx.db.from('profiles').select('id').eq('username', username).maybeSingle()
  if (!p) throw new ApiError('not_found', 'No traveller with that name')
  const svc = ctx.service()
  const { data: rows } = await svc.from('follows').select('follower_id, created_at').eq('following_id', p.id).order('created_at', { ascending: false }).limit(200)
  const ids = (rows ?? []).map((r) => String((r as Record<string, unknown>).follower_id))
  const { data: profiles } = ids.length ? await svc.from('profiles').select(PROFILE_LITE).in('id', ids) : { data: [] }
  const by = new Map((profiles ?? []).map((x) => [String((x as Record<string, unknown>).id), toUserLite(x as Record<string, unknown>)]))
  return ok({ items: ids.map((id) => by.get(id)).filter(Boolean) })
})
