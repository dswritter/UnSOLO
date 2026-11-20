import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseWith, route, uuid } from '@/lib/api/http'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'

type Ctx = { params: Promise<{ id: string }> }

/** Organiser view of join requests with trust signals (trips, reviews, mutual follows). */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { data: post } = await ctx.db.from('posts').select('author_id').eq('id', id).maybeSingle()
  if (!post || post.author_id !== user.id) throw new ApiError('forbidden', 'Only the organiser can see requests')
  const { data, error } = await ctx.db.from('plan_members')
    .select(`user_id, intro, state, created_at, expires_at, profile:profiles!plan_members_user_id_fkey(${PROFILE_LITE})`)
    .eq('post_id', id).eq('role', 'member').order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  const ids = rows.map((r) => r.user_id as string)
  const svc = ctx.service()
  const [trips, reviews, theirFollows, myFollows] = ids.length ? await Promise.all([
    svc.from('bookings').select('user_id').in('user_id', ids).eq('status', 'completed'),
    svc.from('host_reviews').select('host_id, rating').in('host_id', ids),
    svc.from('follows').select('follower_id, following_id').in('follower_id', ids),
    svc.from('follows').select('following_id').eq('follower_id', user.id),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
  const mine = new Set(((myFollows.data ?? []) as { following_id: string }[]).map((f) => f.following_id))
  const items = rows.map((r) => {
    const uid = r.user_id as string
    const rv = ((reviews.data ?? []) as { host_id: string; rating: number }[]).filter((x) => x.host_id === uid)
    return {
      user: {
        ...toUserLite(r.profile as unknown as Record<string, unknown>),
        tripsCount: ((trips.data ?? []) as { user_id: string }[]).filter((t) => t.user_id === uid).length,
        reviewsAvg: rv.length ? Math.round((rv.reduce((s, x) => s + Number(x.rating), 0) / rv.length) * 10) / 10 : null,
        mutuals: ((theirFollows.data ?? []) as { follower_id: string; following_id: string }[]).filter((f) => f.follower_id === uid && mine.has(f.following_id)).length,
      },
      intro: r.intro, state: r.state, createdAt: r.created_at, expiresAt: r.expires_at,
    }
  })
  return ok({ items })
})
