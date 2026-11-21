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
  const viewer = await loadViewer(ctx.db, ctx.user)
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
  const svc = ctx.service()
  const { data: cur } = await svc.from('posts').select('author_id, kind, status, audience, spots_total').eq('id', id).maybeSingle()
  if (!cur || cur.author_id !== user.id) throw new ApiError('not_found')
  if (['held', 'hidden', 'removed'].includes(cur.status as string)) throw new ApiError('forbidden', 'This post is under review and can’t be edited')
  const u: Record<string, unknown> = {}
  const screenOrRefuse = (text: string, field: string, allowMoney = false) => {
    const r = screenText(text, { allowMoney })
    if (r.hold) throw new ApiError('bad_request', 'Charging for this? List it as a hosted trip instead.', { field })
    return r.text
  }
  if (b.title !== undefined) u.title = b.title ? screenOrRefuse(b.title, 'title') : null
  if (b.body !== undefined) u.body = screenOrRefuse(b.body, 'body')
  if (b.startsOn !== undefined) u.starts_on = b.startsOn
  if (b.endsOn !== undefined) u.ends_on = b.endsOn
  if (b.spotsTotal !== undefined) {
    if (cur.kind !== 'plan') throw new ApiError('bad_request', 'Only plans have spots', { field: 'spotsTotal' })
    if (b.spotsTotal >= 5 && (cur.spots_total ?? 0) < 5) {
      const { data: p } = await ctx.db.from('profiles').select('is_id_verified').eq('id', user.id).single()
      if (!p?.is_id_verified) throw new ApiError('forbidden', 'Plans of 5 or more need a verified ID', { field: 'spotsTotal' })
    }
    u.spots_total = b.spotsTotal
  }
  if (b.estCostText !== undefined) u.est_cost_text = b.estCostText ? screenText(b.estCostText, { allowMoney: true }).text : null
  if (b.showOnTripPage !== undefined) u.show_on_trip_page = cur.kind === 'story' && b.showOnTripPage
  if (b.status) u.status = b.status
  if (Object.keys(u).length) {
    const { error } = await svc.from('posts').update(u).eq('id', id).eq('author_id', user.id)
    if (error) throw error
  }
  if (b.meetingPoint !== undefined && cur.kind === 'plan') {
    const mp = b.meetingPoint ? screenText(b.meetingPoint, { allowMoney: true }).text : null
    const { error } = await svc.from('plan_private').upsert({ post_id: id, meeting_point: mp, updated_at: new Date().toISOString() }, { onConflict: 'post_id' })
    if (error) throw error
  }
  const [post] = await loadPosts(ctx.db, [id], await loadViewer(ctx.db, user))
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
