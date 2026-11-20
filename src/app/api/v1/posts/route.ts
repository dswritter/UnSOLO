import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requirePhoneVerified } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { placeSlug, todayIST } from '@/lib/tribe/models'
import { readFlags } from '@/lib/tribe/flags'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { trackServerEvent } from '@/lib/analytics/server'

/** Only images we stored ourselves (via /uploads) — no third-party URLs (tracking pixels, hotlinks). */
const storagePrefix = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/images/`
const OwnImageUrl = z.string().url().max(1000).refine((u) => u.startsWith(storagePrefix()), 'Upload photos through UnSOLO')
const MediaIn = z.object({
  url: OwnImageUrl, thumbUrl: OwnImageUrl.nullable().optional(),
  lqip: z.string().max(2000).regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/).nullable().optional(), width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(), bytes: z.number().int().positive().max(2_097_152).optional(),
})
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const PostIn = z.object({
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

/** Muted / suspended / banned accounts can't post (mirrors public.is_muted). */
async function assertNotMuted(ctx: Awaited<ReturnType<typeof getApiContext>>, userId: string) {
  const { data } = await ctx.service().rpc('is_muted', { p_uid: userId })
  if (data === true) throw new ApiError('forbidden', 'Your account can’t post right now. Check Activity for details.')
}

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requirePhoneVerified(ctx)
  const b = await parseJson(req, PostIn)
  const svc = ctx.service()
  const viewer = () => loadViewer(ctx.db, user.id)

  // Idempotent retry from an offline outbox.
  const existingFor = async () => {
    const { data } = await svc.from('posts').select('id, status').eq('author_id', user.id).eq('client_id', b.clientId).maybeSingle()
    return data
  }
  const replay = async (row: { id: string; status: string }) => {
    const [post] = await loadPosts(ctx.db, [row.id], await viewer())
    return ok({ post, moderation: { state: row.status === 'held' ? 'held' : 'live', prompts: [] } })
  }
  const existing = await existingFor()
  if (existing) return replay(existing)

  const flags = await readFlags(ctx.db)
  if (!flags.tribePostingEnabled) throw new ApiError('forbidden', 'Posting is paused for a little while. Try again soon.')
  await assertNotMuted(ctx, user.id)
  await enforceRateLimit(ctx, 'post')

  if (b.audience !== 'anyone' || (b.kind === 'plan' && (b.spotsTotal ?? 0) >= 5)) {
    const [{ data: p }, { data: priv }] = await Promise.all([
      ctx.db.from('profiles').select('is_id_verified').eq('id', user.id).single(),
      ctx.db.from('profile_private').select('gender').eq('user_id', user.id).maybeSingle(),
    ])
    if (!p?.is_id_verified) throw new ApiError('forbidden', 'Women-only plans and plans of 5 or more need a verified ID', { field: 'audience' })
    if (b.audience === 'women' && priv?.gender !== 'woman') throw new ApiError('forbidden', 'Only women can create women-only plans', { field: 'audience' })
  }
  // A story can only be pinned to a trip the author actually travelled on.
  if (b.tripPackageId) {
    const { data: trip } = await svc.from('bookings').select('id').eq('user_id', user.id).eq('package_id', b.tripPackageId)
      .in('status', ['confirmed', 'completed']).lt('travel_date', todayIST()).limit(1).maybeSingle()
    if (!trip) throw new ApiError('forbidden', 'You can tag a trip once you have travelled on it', { field: 'tripPackageId' })
  }

  const body = screenText(b.body, { allowMoney: b.confirmNonCommercial })
  const title = b.title ? screenText(b.title, { allowMoney: b.confirmNonCommercial }) : null
  const cost = b.estCostText ? screenText(b.estCostText, { allowMoney: true }) : null
  const meeting = b.meetingPoint ? screenText(b.meetingPoint, { allowMoney: true }) : null
  const hold = body.hold || !!title?.hold
  const prompts = [...new Set([...body.prompts, ...(title?.prompts ?? [])])]
  const round = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 1000)

  // Written with the service role after every check above (no direct client inserts — see migration 119).
  const { data: row, error } = await svc.from('posts').insert({
    kind: b.kind, author_id: user.id, client_id: b.clientId,
    title: title?.text ?? null, body: body.text,
    place_name: b.place?.name ?? null, place_slug: b.place ? (b.place.slug || placeSlug(b.place.name)) : null,
    lat: round(b.place?.lat), lng: round(b.place?.lng),
    starts_on: b.startsOn ?? null, ends_on: b.endsOn ?? null,
    spots_total: b.kind === 'plan' ? b.spotsTotal : null,
    audience: b.kind === 'plan' ? b.audience : 'anyone', est_cost_text: cost?.text ?? null,
    trip_package_id: b.kind === 'story' ? b.tripPackageId ?? null : null, show_on_trip_page: b.kind === 'story' && !!b.tripPackageId && b.showOnTripPage,
    poll_options: b.kind === 'ask' && b.poll ? b.poll.map((label, i) => ({ id: String.fromCharCode(97 + i), label })) : null,
    status: hold ? 'held' : 'live',
    moderation_flags: hold ? [...body.flags, ...(title?.flags ?? [])] : [],
  }).select('id').single()
  if (error) {
    // Two retries raced: return the one that won.
    if ((error as { code?: string }).code === '23505') { const again = await existingFor(); if (again) return replay(again) }
    throw error
  }

  const writes: PromiseLike<{ error: unknown }>[] = []
  if (b.kind === 'plan' && meeting?.text) writes.push(svc.from('plan_private').insert({ post_id: row.id, meeting_point: meeting.text }))
  if (b.media.length) {
    writes.push(svc.from('post_media').insert(b.media.map((m, i) => ({
      post_id: row.id, position: i, url: m.url, thumb_url: m.thumbUrl ?? null, lqip: m.lqip ?? null,
      width: m.width ?? null, height: m.height ?? null, bytes: m.bytes ?? null,
    }))))
  }
  const tags = b.kind === 'story' ? b.tagUserIds.filter((id) => id !== user.id) : []
  if (tags.length) writes.push(svc.from('post_tags').insert(tags.map((id) => ({ post_id: row.id, user_id: id }))))
  for (const r of await Promise.all(writes)) if (r.error) throw r.error
  if (tags.length) after(() => dispatchPendingPushes({ userIds: tags }))
  after(() => trackServerEvent(ctx, 'post.create', { kind: b.kind, held: hold }))
  const [post] = await loadPosts(ctx.db, [row.id], await viewer())
  return ok({ post, moderation: { state: hold ? 'held' : 'live', prompts } }, { status: 201 })
})
