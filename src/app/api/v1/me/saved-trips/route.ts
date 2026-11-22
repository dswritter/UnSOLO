import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'

type Row = Record<string, unknown>

/** GET /me/saved-trips: slugs of trips you saved (any device). */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { data, error } = await ctx.db.from('saved_trips').select('created_at, package:packages(slug)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return ok({ slugs: ((data ?? []) as Row[]).map((r) => (r.package as Row | null)?.slug).filter(Boolean) }, { cache: 'private', req })
})

const Body = z.object({ slugs: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)).max(300) })

/** POST /me/saved-trips { slugs }: adds trips saved on this phone before it synced (never removes). */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { slugs } = await parseJson(req, Body)
  if (slugs.length) {
    const { data } = await ctx.db.from('packages').select('id, price_paise').in('slug', slugs)
    const rows = ((data ?? []) as Row[]).map((p) => ({ user_id: user.id, package_id: p.id, price_paise: p.price_paise }))
    if (rows.length) await ctx.db.from('saved_trips').upsert(rows, { onConflict: 'user_id,package_id', ignoreDuplicates: true })
  }
  return ok({ added: slugs.length })
})
