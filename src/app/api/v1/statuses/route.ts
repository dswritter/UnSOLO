import { z } from 'zod'
import { getApiContext, requireVerifiedContact } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseQuery, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { MAX_ACTIVE_STATUS, STATUS_SELECT, STATUS_TTL_MS, groupStatuses } from '@/lib/statusStories/api'

type Row = Record<string, unknown>

const Q = z.object({ user: z.string().uuid().optional() })

/**
 * GET /statuses: live statuses you can see, one entry per person (yours first, then unseen).
 * With ?user=, just that person's (their profile ring). Signed out: none.
 */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const q = parseQuery(req, Q)
  if (!ctx.user) return ok({ authors: [] }, { cache: 'private', req })
  let query = ctx.db.from('status_stories').select(STATUS_SELECT).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(q.user ? 20 : 200)
  if (q.user) query = query.eq('author_id', q.user)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const ids = rows.map((r) => String(r.id))
  const { data: views } = ids.length
    ? await ctx.db.from('status_story_views').select('story_id').eq('viewer_id', ctx.user.id).in('story_id', ids)
    : { data: [] as Row[] }
  const seen = new Set(((views ?? []) as Row[]).map((v) => String(v.story_id)))
  return ok({ authors: groupStatuses(rows, seen, ctx.user.id) }, { cache: 'private', req })
})

const Body = z.object({
  media: z.array(z.object({ url: z.string().url().max(600) })).max(MAX_ACTIVE_STATUS).default([]),
  caption: z.string().trim().max(500).optional(),
  audience: z.enum(['all', 'followers']).default('all'),
})

/** POST /statuses: one status per photo (the caption goes with each), or a text status. Gone in 24 hours. */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireVerifiedContact(ctx)
  const b = await parseJson(req, Body)
  const caption = b.caption?.trim() || null
  if (!b.media.length && !caption) throw new ApiError('bad_request', 'Add a photo or some text')
  if (caption) {
    const s = screenText(caption)
    if (s.hold) throw new ApiError('bad_request', 'This can’t be shared. Please keep it kind and safe.', { field: 'caption' })
  }
  // Photos must be ones we stored (our storage bucket), not any URL.
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`
  if (b.media.some((m) => !m.url.startsWith(base))) throw new ApiError('bad_request', 'Upload the photo first', { field: 'media' })
  await enforceRateLimit(ctx, 'post')
  const { count } = await ctx.db.from('status_stories').select('id', { count: 'exact', head: true })
    .eq('author_id', user.id).gt('expires_at', new Date().toISOString())
  const adding = b.media.length || 1
  if ((count ?? 0) + adding > MAX_ACTIVE_STATUS) {
    throw new ApiError('conflict', `You can have ${MAX_ACTIVE_STATUS} stories up at once. Delete one or wait for it to expire.`)
  }
  const expires = new Date(Date.now() + STATUS_TTL_MS).toISOString()
  const audience = { mode: b.audience }
  const rows = b.media.length
    ? b.media.map((m) => ({ author_id: user.id, media_url: m.url, media_type: 'image', caption, expires_at: expires, audience }))
    : [{ author_id: user.id, media_url: null, media_type: 'text', caption, bg_color: '#1a1a2e', expires_at: expires, audience }]
  const { data, error } = await ctx.db.from('status_stories').insert(rows).select(STATUS_SELECT)
  if (error) throw error
  return ok({ authors: groupStatuses((data ?? []) as Row[], new Set(), user.id) }, { status: 201 })
})

