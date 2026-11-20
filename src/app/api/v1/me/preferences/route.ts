import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { loadPreferences, PreferencesPatch, savePreferences } from '@/lib/tribe/preferences'

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  return ok(await loadPreferences(ctx.db, user.id))
})

export const PUT = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const patch = await parseJson(req, PreferencesPatch)
  return ok(await savePreferences(ctx.db, user.id, patch))
})
