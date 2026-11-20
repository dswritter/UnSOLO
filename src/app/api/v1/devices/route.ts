import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, parseJson, route } from '@/lib/api/http'

const Body = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  token: z.string().min(16).max(4096),
  appVersion: z.string().max(40).optional(),
  locale: z.string().max(20).optional(),
})

/** Register / refresh a push token. A token moves to the latest signed-in user on this device. */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  const svc = ctx.service()
  // Same device, different account: drop the old owner so pushes never cross accounts.
  await svc.from('device_tokens').delete().eq('platform', b.platform).eq('token', b.token).neq('user_id', user.id)
  const { error } = await ctx.db.from('device_tokens').upsert({
    user_id: user.id, platform: b.platform, token: b.token, app_version: b.appVersion ?? null,
    locale: b.locale ?? null, last_seen_at: new Date().toISOString(),
  }, { onConflict: 'platform,token' })
  if (error) throw error
  return noContent()
})

export const DELETE = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { token } = await parseJson(req, z.object({ token: z.string().min(16).max(4096) }))
  await ctx.db.from('device_tokens').delete().eq('user_id', user.id).eq('token', token)
  return noContent()
})
