import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requirePhoneVerified } from '@/lib/api/context'
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
  const user = await requirePhoneVerified(ctx)
  const b = await parseJson(req, Body)
  const sel = `id, post_id, parent_id, body, poll_choice, created_at, author:profiles!post_comments_author_id_fkey(${PROFILE_LITE})`
  const { data: dup } = await ctx.db.from('post_comments').select(sel).eq('author_id', user.id).eq('client_id', b.clientId).maybeSingle()
  const shape = (c: Record<string, unknown>) => ({
    id: String(c.id), postId: String(c.post_id), parentId: (c.parent_id as string | null) ?? null,
    author: toUserLite(c.author as Record<string, unknown>), body: String(c.body),
    pollChoice: (c.poll_choice as string | null) ?? null, createdAt: String(c.created_at), replies: [],
  })
  if (dup) return ok(shape(dup))
  await enforceRateLimit(ctx, 'comment')
  const s = screenText(b.body)
  if (s.hold) throw new ApiError('bad_request', s.prompts.includes('money')
    ? 'Payments and prices per person go through hosted trips, not comments.'
    : 'This comment can\'t be posted. Please keep it kind and safe.', { field: 'body' })
  if (b.pollChoice) {
    // one vote per person: clear an earlier vote
    await ctx.db.from('post_comments').update({ poll_choice: null }).eq('post_id', id).eq('author_id', user.id).not('poll_choice', 'is', null)
  }
  const { data, error } = await ctx.db.from('post_comments').insert({
    post_id: id, author_id: user.id, client_id: b.clientId, body: s.text,
    parent_id: b.parentId ?? null, poll_choice: b.pollChoice ?? null,
  }).select(sel).single()
  if (error) throw error
  after(async () => {
    await dispatchPendingPushes({ limit: 20 })
    await trackServerEvent(ctx, 'post.comment', {})
  })
  return ok(shape(data), { status: 201 })
})
