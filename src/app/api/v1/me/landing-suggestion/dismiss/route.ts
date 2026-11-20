import { getApiContext, requireUser } from '@/lib/api/context'
import { noContent, route } from '@/lib/api/http'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('user_preferences')
    .upsert({ user_id: user.id, landing_prompt_dismissed_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
  return noContent()
})
