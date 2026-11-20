import { z } from 'zod'
import { after } from 'next/server'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseWith, route, uuid } from '@/lib/api/http'
import { trackServerEvent } from '@/lib/analytics/server'

type Ctx = { params: Promise<{ id: string; kind: string }> }
const Kind = z.enum(['want_to_go', 'helpful', 'love'])

async function state(db: Awaited<ReturnType<typeof getApiContext>>['db'], postId: string, userId: string) {
  const [{ data: p }, { data: mine }] = await Promise.all([
    db.from('posts').select('reaction_counts').eq('id', postId).single(),
    db.from('post_reactions').select('kind').eq('post_id', postId).eq('user_id', userId),
  ])
  const rc = (p?.reaction_counts ?? {}) as Record<string, number>
  return { reactions: { wantToGo: rc.want_to_go ?? 0, helpful: rc.helpful ?? 0, love: rc.love ?? 0 }, myReactions: (mine ?? []).map((r) => r.kind) }
}

export const PUT = route(async (req: Request, { params }: Ctx) => {
  const p = await params
  const id = parseWith(uuid, p.id), kind = parseWith(Kind, p.kind)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { error } = await ctx.db.from('post_reactions').upsert({ post_id: id, user_id: user.id, kind }, { onConflict: 'post_id,user_id,kind', ignoreDuplicates: true })
  if (error) throw error
  after(() => trackServerEvent(ctx, 'post.react', { kind }))
  return ok(await state(ctx.db, id, user.id))
})

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const p = await params
  const id = parseWith(uuid, p.id), kind = parseWith(Kind, p.kind)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await ctx.db.from('post_reactions').delete().eq('post_id', id).eq('user_id', user.id).eq('kind', kind)
  return ok(await state(ctx.db, id, user.id))
})
