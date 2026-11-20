import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'

/** Delta sync for offline caches: which posts to refetch / drop, unread counts, membership changes. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  requireUser(ctx)
  const { since } = parseQuery(req, z.object({ since: z.string().datetime({ offset: true }) }))
  const { data, error } = await ctx.db.rpc('sync_changes', { p_since: since })
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  return ok({
    serverTime: d.server_time, posts: d.posts ?? [], removedPosts: d.removed_posts ?? [],
    notifications: d.notifications ?? 0, unreadNotifications: d.unread_notifications ?? 0,
    memberships: ((d.memberships ?? []) as { post_id: string; state: string }[]).map((m) => ({ postId: m.post_id, state: m.state })),
  })
})
