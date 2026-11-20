import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { screenText } from '@/lib/moderation/screen'
import { HOST_OFFER_SELECT } from '@/lib/tribe/offers'
import { toHostOffer } from '@/lib/tribe/models'
import { readFlags } from '@/lib/tribe/flags'
import { dispatchPendingPushes } from '@/lib/push/dispatch'

type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({
  pricePaise: z.number().int().min(10000).max(100_000_00),
  includes: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  notes: z.string().trim().max(1000).nullable().optional(),
  extraSeats: z.number().int().min(0).max(20).default(0),
})

/** A verified host offers to run a community plan as a paid, hosted trip. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  if (!(await readFlags(ctx.db)).hostOffersEnabled) throw new ApiError('forbidden', 'Host offers are paused')
  const b = await parseJson(req, Body)
  const { data: post } = await ctx.db.from('posts').select('author_id').eq('id', id).maybeSingle()
  const { data, error } = await ctx.db.from('host_offers').insert({
    post_id: id, host_id: user.id, price_paise: b.pricePaise, includes: b.includes,
    notes: b.notes ? screenText(b.notes, { allowMoney: true }).text : null, extra_seats: b.extraSeats,
  }).select(HOST_OFFER_SELECT).single()
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new ApiError('forbidden', 'Only verified hosts can offer to host a plan')
    throw error
  }
  if (post) after(() => dispatchPendingPushes({ userIds: [post.author_id as string] }))
  return ok(toHostOffer(data as Record<string, unknown>), { status: 201 })
})

export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  requireUser(ctx)
  const { data, error } = await ctx.db.from('host_offers').select(HOST_OFFER_SELECT).eq('post_id', id).order('created_at', { ascending: false })
  if (error) throw error
  return ok({ items: (data ?? []).map((o) => toHostOffer(o as Record<string, unknown>)) })
})
