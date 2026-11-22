import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'

const Body = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) })

/** POST /statuses/seen { ids }: marks statuses as seen by you (rings turn grey, authors see the count). */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireUser(ctx)
  const { ids } = await parseJson(req, Body)
  const rows = [...new Set(ids)].map((story_id) => ({ story_id, viewer_id: user.id }))
  const { error } = await ctx.db.from('status_story_views').upsert(rows, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true })
  if (error) throw error
  return ok({ ok: true })
})
