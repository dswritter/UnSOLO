import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'

type Ctx = { params: Promise<{ username: string }> }

export const GET = route(async (req: Request, { params }: Ctx) => {
  const username = parseWith(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), (await params).username)
  const ctx = await getApiContext(req)
  const { data: p } = await ctx.db.from('profiles').select(`${PROFILE_LITE}, bio, home_city, trips_private`).eq('username', username).maybeSingle()
  if (!p) throw new ApiError('not_found', 'No traveller with that name')
  const svc = ctx.service()
  const [{ count: followers }, { count: following }, { count: tripsCount }, { data: posts }, isFollowing] = await Promise.all([
    ctx.db.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', p.id),
    ctx.db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', p.id),
    p.trips_private ? Promise.resolve({ count: null }) : svc.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('status', 'completed'),
    ctx.db.from('posts').select('id, kind, status, starts_on').eq('author_id', p.id).in('status', ['live', 'past']).order('created_at', { ascending: false }).limit(30),
    ctx.user ? ctx.db.from('follows').select('id').eq('follower_id', ctx.user.id).eq('following_id', p.id).maybeSingle().then((r) => !!r.data) : Promise.resolve(false),
  ])
  const viewer = await loadViewer(ctx.db, ctx.user?.id)
  const all = await loadPosts(ctx.db, (posts ?? []).map((x) => x.id as string), viewer)
  const openPlan = all.find((x) => x.kind === 'plan' && x.status === 'live' && x.memberCount < (x.spotsTotal ?? 0)) ?? null
  return ok({
    user: { ...toUserLite(p), bio: p.bio ?? null, homeCity: p.home_city ?? null, tripsCount: tripsCount ?? null, followers: followers ?? 0, following: following ?? 0 },
    posts: all.filter((x) => x.id !== openPlan?.id),
    openPlan,
    isFollowing,
  })
})
