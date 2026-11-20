import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { dispatchPendingPushes } from '@/lib/push/dispatch'

type Ctx = { params: Promise<{ id: string }> }

/** Organiser accepts: the plan becomes a hosted trip; members get held seats for 48h. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  requireUser(ctx)
  // The price the organiser was shown; if the host edited it since, the DB refuses (409).
  const { expectedPricePaise } = await parseJson(req, z.object({ expectedPricePaise: z.number().int().positive() }))
  const { data: pkgId, error } = await ctx.db.rpc('accept_host_offer', { p_offer_id: id, p_expected_price_paise: expectedPricePaise })
  if (error) throw error
  const { data } = await ctx.db.from('host_offers').select('pay_by, package:packages(slug)').eq('id', id).single()
  after(() => dispatchPendingPushes({ limit: 50 }))
  const pkg = data?.package as unknown as { slug: string } | null
  return ok({ packageId: pkgId, packageSlug: pkg?.slug ?? null, payBy: data?.pay_by ?? null })
})
