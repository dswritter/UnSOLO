import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { STATUS_REACTIONS, loadStatusExtras } from '@/lib/statusStories/api'
import { visibleStory } from '@/lib/statusStories/access'

type Ctx = { params: Promise<{ id: string }> }
const Body = z.object({ kind: z.enum(STATUS_REACTIONS).nullable() })

/** PUT /statuses/{id}/reaction { kind | null }: one reaction per person; null takes it back. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { kind } = await parseJson(req, Body)
  const story = await visibleStory(ctx, id)
  await enforceRateLimit(ctx, 'vote')
  const svc = ctx.service()
  const w = kind
    ? await svc.from('status_story_reactions').upsert({ story_id: id, user_id: user.id, kind, created_at: new Date().toISOString() }, { onConflict: 'story_id,user_id' })
    : await svc.from('status_story_reactions').delete().eq('story_id', id).eq('user_id', user.id)
  if (w.error) throw w.error
  if (kind && story.authorId !== user.id) {
    await svc.rpc('create_notification', { p_user_id: story.authorId, p_type: 'story_reaction', p_title: 'New reaction', p_body: 'Someone reacted to your story', p_link: '/' })
  }
  const x = await loadStatusExtras(svc, [id], user.id)
  return ok({ reactions: x.reactions.get(id) ?? {}, myReaction: x.mine.get(id) ?? null })
})
