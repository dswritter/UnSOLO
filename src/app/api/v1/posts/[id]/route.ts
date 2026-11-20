import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, noContent, ok, parseJson, route, uuid, parseWith } from '@/lib/api/http'
import { screenText } from '@/lib/moderation/screen'
import { loadComments, loadPosts, loadViewer } from '@/lib/tribe/load'
import { HOST_OFFER_SELECT } from '@/lib/tribe/offers'
import { toHostOffer } from '@/lib/tribe/models'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const viewer = await loadViewer(ctx.db, ctx.user?.id)
  const [post] = await loadPosts(ctx.db, [id], viewer)
  if (!post || post.status === 'removed') throw new ApiError('not_found', 'This post is no longer available')
  const [comments, offers] = await Promise.all([
    loadComments(ctx.db, id),
    post.kind === 'plan' && (post.viewer.isAuthor || post.viewer.membership === 'approved')
      ? ctx.db.from('host_offers').select(HOST_OFFER_SELECT).eq('post_id', id).order('created_at', { ascending: false }).then((r) => (r.data ?? []).map((o) => toHostOffer(o as Record<string, unknown>)))
      : Promise.resolve([]),
  ])
  return ok({ post, comments, offers })
})

const Patch = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().max(4000).optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  spotsTotal: z.number().int().min(2).max(30).optional(),
  estCostText: z.string().trim().max(120).nullable().optional(),
  meetingPoint: z.string().trim().max(300).nullable().optional(),
  showOnTripPage: z.boolean().optional(),
  status: z.literal('cancelled').optional(),
}).strict()

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Patch)
  const u: Record<string, unknown> = {}
  if (b.title !== undefined) u.title = b.title ? screenText(b.title).text : null
  if (b.body !== undefined) {
    const s = screenText(b.body)
    u.body = s.text
    if (s.hold) throw new ApiError('bad_request', 'Charging for this? List it as a hosted trip instead.', { field: 'body' })
  }
  if (b.startsOn !== undefined) u.starts_on = b.startsOn
  if (b.endsOn !== undefined) u.ends_on = b.endsOn
  if (b.spotsTotal !== undefined) u.spots_total = b.spotsTotal
  if (b.estCostText !== undefined) u.est_cost_text = b.estCostText
  if (b.meetingPoint !== undefined) u.meeting_point = b.meetingPoint
  if (b.showOnTripPage !== undefined) u.show_on_trip_page = b.showOnTripPage
  if (b.status) u.status = b.status
  const { data, error } = await ctx.db.from('posts').update(u).eq('id', id).eq('author_id', user.id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError('not_found')
  const [post] = await loadPosts(ctx.db, [id], await loadViewer(ctx.db, user.id))
  return ok({ post })
})

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('posts').delete().eq('id', id).eq('author_id', user.id)
  if (error) throw error
  return noContent()
})
