import { z } from 'zod'
import { getApiContext, requireUser, requireVerifiedContact } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'
import { visibleStory } from '@/lib/statusStories/access'

type Ctx = { params: Promise<{ id: string }> }
type Row = Record<string, unknown>
const SEL = `id, story_id, body, created_at, author:profiles!status_story_comments_author_id_fkey(${PROFILE_LITE})`
const shape = (c: Row) => ({ id: String(c.id), body: String(c.body), createdAt: String(c.created_at), author: toUserLite(c.author as Row) })

/** GET /statuses/{id}/comments: comments on a story you can see, oldest first. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  requireUser(ctx)
  await visibleStory(ctx, id)
  const { data, error } = await ctx.db.from('status_story_comments').select(SEL).eq('story_id', id).order('created_at', { ascending: true }).limit(200)
  if (error) throw error
  return ok({ items: ((data ?? []) as Row[]).map(shape) })
})

const Body = z.object({ body: z.string().trim().min(1).max(500) })

/** POST /statuses/{id}/comments { body }: the author gets a notification. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = await requireVerifiedContact(ctx)
  const { body } = await parseJson(req, Body)
  const story = await visibleStory(ctx, id)
  await enforceRateLimit(ctx, 'comment')
  const s = screenText(body)
  if (s.hold) throw new ApiError('bad_request', 'This comment can’t be posted. Please keep it kind and safe.', { field: 'body' })
  const svc = ctx.service()
  const { data, error } = await svc.from('status_story_comments').insert({ story_id: id, author_id: user.id, body: s.text }).select(SEL).single()
  if (error) throw error
  if (story.authorId !== user.id) {
    await svc.rpc('create_notification', { p_user_id: story.authorId, p_type: 'story_comment', p_title: 'New comment on your story', p_body: s.text.slice(0, 140), p_link: '/' })
  }
  return ok(shape(data as Row), { status: 201 })
})
