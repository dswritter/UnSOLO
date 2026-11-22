import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'

type Ctx = { params: Promise<{ username: string }> }
const name = z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/)

async function target(ctx: Awaited<ReturnType<typeof getApiContext>>, username: string) {
  const { data } = await ctx.db.from('profiles').select('id').eq('username', username).maybeSingle()
  if (!data) throw new ApiError('not_found', 'No traveller with that name')
  return String(data.id)
}

async function counts(ctx: Awaited<ReturnType<typeof getApiContext>>, id: string) {
  const svc = ctx.service()
  const [a, b] = await Promise.all([
    svc.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', id),
    svc.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
  ])
  return { followers: a.count ?? 0, following: b.count ?? 0 }
}

/** PUT /users/{username}/follow: follow. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const id = await target(ctx, parseWith(name, (await params).username))
  if (id === user.id) throw new ApiError('bad_request', 'You can’t follow yourself')
  const { error } = await ctx.db.from('follows').insert({ follower_id: user.id, following_id: id })
  if (error && error.code !== '23505') throw error
  return ok({ isFollowing: true, ...(await counts(ctx, id)) })
})

/** DELETE /users/{username}/follow: unfollow. */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const id = await target(ctx, parseWith(name, (await params).username))
  const { error } = await ctx.db.from('follows').delete().eq('follower_id', user.id).eq('following_id', id)
  if (error) throw error
  return ok({ isFollowing: false, ...(await counts(ctx, id)) })
})
