import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requirePhoneVerified } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { placeSlug } from '@/lib/tribe/models'
import { readFlags } from '@/lib/tribe/flags'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { trackServerEvent } from '@/lib/analytics/server'

const MediaIn = z.object({
  url: z.string().url().max(1000), thumbUrl: z.string().url().max(1000).nullable().optional(),
  lqip: z.string().max(2000).nullable().optional(), width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(), bytes: z.number().int().positive().max(2_097_152).optional(),
})
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const PostIn = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(['plan', 'story', 'ask']),
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().max(4000).default(''),
  place: z.object({ name: z.string().trim().min(2).max(120), slug: z.string().max(60).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() }).nullable().optional(),
  startsOn: date.nullable().optional(),
  endsOn: date.nullable().optional(),
  spotsTotal: z.number().int().min(2).max(30).nullable().optional(),
  audience: z.enum(['anyone', 'women', 'verified']).default('anyone'),
  estCostText: z.string().trim().max(120).nullable().optional(),
  meetingPoint: z.string().trim().max(300).nullable().optional(),
  tripPackageId: z.string().uuid().nullable().optional(),
  showOnTripPage: z.boolean().default(false),
  poll: z.array(z.string().trim().min(1).max(80)).min(2).max(4).nullable().optional(),
  media: z.array(MediaIn).max(6).default([]),
  tagUserIds: z.array(z.string().uuid()).max(12).default([]),
  confirmNonCommercial: z.boolean().default(false),
}).superRefine((b, ctx) => {
  if (b.kind === 'plan') {
    if (!b.place) ctx.addIssue({ code: 'custom', message: 'Where are you going?', path: ['place'] })
    if (!b.startsOn) ctx.addIssue({ code: 'custom', message: 'Pick a start date', path: ['startsOn'] })
    if (!b.spotsTotal) ctx.addIssue({ code: 'custom', message: 'How many people in total?', path: ['spotsTotal'] })
  }
  if (b.kind === 'ask' && b.body.length < 10) ctx.addIssue({ code: 'custom', message: 'Ask a full question', path: ['body'] })
  if (b.kind === 'story' && b.body.length < 1 && b.media.length === 0) ctx.addIssue({ code: 'custom', message: 'Add a photo or a few words', path: ['body'] })
  if (b.startsOn && b.endsOn && b.endsOn < b.startsOn) ctx.addIssue({ code: 'custom', message: 'End date is before start', path: ['endsOn'] })
})

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requirePhoneVerified(ctx)
  const b = await parseJson(req, PostIn)

  // Idempotent retry from an offline outbox.
  const { data: existing } = await ctx.db.from('posts').select('id, status').eq('author_id', user.id).eq('client_id', b.clientId).maybeSingle()
  if (existing) {
    const [post] = await loadPosts(ctx.db, [existing.id], await loadViewer(ctx.db, user.id))
    return ok({ post, moderation: { state: existing.status === 'held' ? 'held' : 'live', prompts: [] } })
  }

  const flags = await readFlags(ctx.db)
  if (!flags.tribePostingEnabled) throw new ApiError('forbidden', 'Posting is paused for a little while. Try again soon.')
  await enforceRateLimit(ctx, 'post')

  if (b.audience !== 'anyone' || (b.kind === 'plan' && (b.spotsTotal ?? 0) >= 5)) {
    const { data: p } = await ctx.db.from('profiles').select('is_id_verified, gender').eq('id', user.id).single()
    if (!p?.is_id_verified) throw new ApiError('forbidden', 'Women-only plans and plans of 5 or more need a verified ID', { field: 'audience' })
    if (b.audience === 'women' && p.gender !== 'woman') throw new ApiError('forbidden', 'Only women can create women-only plans', { field: 'audience' })
  }

  const body = screenText(b.body, { allowMoney: b.confirmNonCommercial })
  const title = b.title ? screenText(b.title, { allowMoney: b.confirmNonCommercial }) : null
  const cost = b.estCostText ? screenText(b.estCostText, { allowMoney: true }) : null
  const meeting = b.meetingPoint ? screenText(b.meetingPoint, { allowMoney: true }) : null
  const hold = body.hold || !!title?.hold
  const prompts = [...new Set([...body.prompts, ...(title?.prompts ?? [])])]
  const round = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 1000)

  const { data: row, error } = await ctx.db.from('posts').insert({
    kind: b.kind, author_id: user.id, client_id: b.clientId,
    title: title?.text ?? null, body: body.text,
    place_name: b.place?.name ?? null, place_slug: b.place ? (b.place.slug || placeSlug(b.place.name)) : null,
    lat: round(b.place?.lat), lng: round(b.place?.lng),
    starts_on: b.startsOn ?? null, ends_on: b.endsOn ?? null,
    spots_total: b.kind === 'plan' ? b.spotsTotal : null,
    audience: b.audience, est_cost_text: cost?.text ?? null, meeting_point: meeting?.text ?? null,
    trip_package_id: b.tripPackageId ?? null, show_on_trip_page: b.kind === 'story' && b.showOnTripPage,
    poll_options: b.kind === 'ask' && b.poll ? b.poll.map((label, i) => ({ id: String.fromCharCode(97 + i), label })) : null,
    status: hold ? 'held' : 'live',
  }).select('id').single()
  if (error) throw error

  if (b.media.length) {
    const { error: mErr } = await ctx.db.from('post_media').insert(b.media.map((m, i) => ({
      post_id: row.id, position: i, url: m.url, thumb_url: m.thumbUrl ?? null, lqip: m.lqip ?? null,
      width: m.width ?? null, height: m.height ?? null, bytes: m.bytes ?? null,
    })))
    if (mErr) throw mErr
  }
  if (b.kind === 'story' && b.tagUserIds.length) {
    await ctx.db.from('post_tags').insert(b.tagUserIds.filter((id) => id !== user.id).map((id) => ({ post_id: row.id, user_id: id })))
    after(() => dispatchPendingPushes({ userIds: b.tagUserIds }))
  }
  if (hold) {
    // Queue a system report so staff see held posts in the moderation queue.
    await ctx.service().from('posts').update({ moderation_flags: [...body.flags, ...(title?.flags ?? [])] }).eq('id', row.id)
  }
  after(() => trackServerEvent(ctx, 'post.create', { kind: b.kind, held: hold }))
  const [post] = await loadPosts(ctx.db, [row.id], await loadViewer(ctx.db, user.id))
  return ok({ post, moderation: { state: hold ? 'held' : 'live', prompts } }, { status: 201 })
})
