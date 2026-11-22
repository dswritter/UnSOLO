import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseWith, route } from '@/lib/api/http'

type Ctx = { params: Promise<{ slug: string }> }
const slugRe = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)

async function pkg(ctx: Awaited<ReturnType<typeof getApiContext>>, slug: string) {
  const { data } = await ctx.db.from('packages').select('id, price_paise').eq('slug', slug).maybeSingle()
  if (!data) throw new ApiError('not_found', 'Trip not found')
  return data
}

/** PUT /trips/{slug}/save: save a trip. We'll tell you if its price drops or it's nearly full. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const slug = parseWith(slugRe, (await params).slug)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const p = await pkg(ctx, slug)
  const { error } = await ctx.db.from('saved_trips').upsert({ user_id: user.id, package_id: p.id, price_paise: p.price_paise }, { onConflict: 'user_id,package_id', ignoreDuplicates: true })
  if (error) throw error
  return ok({ saved: true })
})

/** DELETE /trips/{slug}/save */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const slug = parseWith(slugRe, (await params).slug)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const p = await pkg(ctx, slug)
  await ctx.db.from('saved_trips').delete().eq('user_id', user.id).eq('package_id', p.id)
  return ok({ saved: false })
})
