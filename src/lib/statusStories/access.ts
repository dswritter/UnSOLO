import type { ApiContext } from '@/lib/api/context'
import { ApiError } from '@/lib/api/http'

/** The story, if you can see it (RLS decides) and it hasn't expired. */
export async function visibleStory(ctx: ApiContext, id: string) {
  const { data } = await ctx.db.from('status_stories').select('id, author_id, expires_at').eq('id', id).maybeSingle()
  if (!data || new Date(String(data.expires_at)).getTime() <= Date.now()) throw new ApiError('not_found', 'This story has expired')
  return { id: String(data.id), authorId: String(data.author_id) }
}
