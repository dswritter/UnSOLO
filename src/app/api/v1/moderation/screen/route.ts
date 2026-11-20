import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { screenText } from '@/lib/moderation/screen'

/** Pre-publish check so composers can show "Charging for this?" before creating the post. */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  requireUser(ctx)
  const { text } = await parseJson(req, z.object({ text: z.string().max(8000) }))
  const r = screenText(text)
  return ok({ prompts: r.prompts, hold: r.hold })
})
