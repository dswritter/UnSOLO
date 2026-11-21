import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireVerifiedContact } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { loadComments } from '@/lib/tribe/load'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { trackServerEvent } from '@/lib/analytics/server'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  return ok({ items: await loadComments(ctx.db, id, 200), nextCursor: null })
})

const Body = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().uuid().nullable().optional(),
  pollChoice: z.string().regex(/^[a-d]$/).nullable().optional(),
})

export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = await requireVerifiedContact(ctx)
  const b = await parseJson(req, Body)
  const svc = ctx.service()
  const sel = `id, post_id, parent_id, body, poll_choice, created_at, author:profiles!post_comments_author_id_fkey(${PROFILE_LITE})`
  const shape = (c: Record<string, unknown>) => ({
    id: String(c.id), postId: String(c.post_id), parentId: (c.parent_id as string | null) ?? null,
    author: toUserLite(c.author as Record<string, unknown>), body: String(c.body),
    pollChoice: (c.poll_choice as string | null) ?? null, createdAt: String(c.created_at), replies: [],
  })
  const existing = async () => (await svc.from('post_comments').select(sel).eq('author_id', user.id).eq('client_id', b.clientId).maybeSingle()).data
  const dup = await existing()
  if (dup) return ok(shape(dup))

  // Checks the database no longer does for us (comments are written with the service role):
  // the post must be visible to this person and live, no block either way, not muted.
  const { data: post } = await ctx.db.from('posts').select('id, author_id, status, kind').eq('id', id).maybeSingle()
  if (!post) throw new ApiError('not_found', 'This post is no longer available')
  if (post.status !== 'live') throw new ApiError('forbidden', 'Replies are closed on this post')
  const [{ data: blocked }, { data: muted }] = await Promise.all([
    svc.rpc('is_blocked_between', { a: post.author_id, b: user.id }),
    svc.rpc('is_muted', { p_uid: user.id }),
  ])
  if (blocked === true) throw new ApiError('forbidden', 'You can’t reply to this post')
  if (muted === true) throw new ApiError('forbidden', 'Your account can’t reply right now. Check Activity for details.')
  let parentAuthor: string | null = null
  if (b.parentId) {
    const { data: parent } = await svc.from('post_comments').select('post_id, parent_id, author_id').eq('id', b.parentId).maybeSingle()
    if (!parent || parent.post_id !== id || parent.parent_id) throw new ApiError('bad_request', 'Replies are one level deep', { field: 'parentId' })
    parentAuthor = parent.author_id as string
  }
  if (b.pollChoice && post.kind !== 'ask') throw new ApiError('bad_request', 'This post has no poll', { field: 'pollChoice' })
  await enforceRateLimit(ctx, 'comment')
  const s = screenText(b.body)
  if (s.hold) throw new ApiError('bad_request', s.prompts.includes('money')
    ? 'Payments and prices per person go through hosted trips, not comments.'
    : 'This comment can\'t be posted. Please keep it kind and safe.', { field: 'body' })
  if (b.pollChoice) {
    // one vote per person: clear an earlier vote
    await svc.from('post_comments').update({ poll_choice: null }).eq('post_id', id).eq('author_id', user.id).not('poll_choice', 'is', null)
  }
  const { data, error } = await svc.from('post_comments').insert({
    post_id: id, author_id: user.id, client_id: b.clientId, body: s.text,
    parent_id: b.parentId ?? null, poll_choice: b.pollChoice ?? null,
  }).select(sel).single()
  if (error) {
    if ((error as { code?: string }).code === '23505') { const again = await existing(); if (again) return ok(shape(again)) }
    throw error
  }
  after(async () => {
    const notify = [post.author_id as string, ...(parentAuthor ? [parentAuthor] : [])].filter((u) => u !== user.id)
    await dispatchPendingPushes({ userIds: notify, limit: 20 })
    await trackServerEvent(ctx, 'post.comment', {})
  })
  return ok(shape(data), { status: 201 })
})
