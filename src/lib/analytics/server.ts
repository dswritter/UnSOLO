import type { ApiContext } from '@/lib/api/context'

/** Server-side event (authoritative actions). Never throws. */
export async function trackServerEvent(ctx: ApiContext, name: string, props: Record<string, unknown>, screen?: string) {
  try {
    await ctx.service().from('analytics_events').insert({
      user_id: ctx.user?.id ?? null, name, props, screen: screen ?? null,
      platform: ctx.client.platform, app_version: ctx.client.version,
    })
  } catch {
    /* analytics must never break a request */
  }
}
