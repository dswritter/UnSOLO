import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { ilikeExact, requireHost } from '@/lib/host/server'

const Body = z.object({
  name: z.string({ error: 'Enter the destination name' }).trim().min(1, 'Enter the destination name').max(100),
  state: z.string({ error: 'Enter the state' }).trim().min(1, 'Enter the state').max(100),
})

/**
 * POST /host/destinations: find or create a destination (same name + state, any case, India).
 * Hosts can't insert destinations under RLS, so a new one is created with the service role.
 */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireHost(ctx)
  const { name, state } = await parseJson(req, Body)

  const { data: found, error } = await ctx.db.from('destinations').select('id, name, state')
    .ilike('name', ilikeExact(name)).ilike('state', ilikeExact(state)).eq('country', 'India').limit(1)
  if (error) throw error
  if (found?.[0]) return ok({ id: found[0].id, name: found[0].name, state: found[0].state })

  await enforceRateLimit(ctx, 'post', `destination:${user.id}`)
  const svc = ctx.service()
  const baseSlug = `${name}-${state}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 72)
  const insert = (slug: string) => svc.from('destinations').insert({ name, state, country: 'India', slug }).select('id, name, state').single()
  let res = await insert(baseSlug || `dest-${Date.now().toString(36)}`)
  if (res.error && (res.error.code === '23505' || /unique/i.test(res.error.message))) {
    res = await insert(`${baseSlug.slice(0, 48)}-${Date.now().toString(36)}`.replace(/(^-|-$)/g, ''))
  }
  if (res.error) throw res.error
  return ok({ id: res.data.id, name: res.data.name, state: res.data.state })
})
