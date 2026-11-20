import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { loadPreferences } from '@/lib/tribe/preferences'
import { suggestLandingTab } from '@/lib/tribe/landing'

/** Suggests making the most-used tab the landing tab (spec: "save their preference to open that page"). */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const [prefs, { data }] = await Promise.all([
    loadPreferences(ctx.db, user.id),
    ctx.service().from('analytics_events').select('screen').eq('user_id', user.id).eq('name', 'screen.view')
      .in('screen', ['explore', 'tribe', 'trips']).gte('ts', since).limit(2000),
  ])
  const visits = { explore: 0, tribe: 0, trips: 0 }
  for (const r of data ?? []) visits[r.screen as keyof typeof visits]++
  const { data: row } = await ctx.db.from('user_preferences').select('landing_prompt_dismissed_at').eq('user_id', user.id).maybeSingle()
  const suggest = suggestLandingTab(visits, prefs.landingTab, row?.landing_prompt_dismissed_at ?? null)
  return ok({ suggest, visits })
})
