import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseQuery, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { MESSAGE_SELECT, toMessage } from '@/lib/tribe/chats'
import { pushToUsers } from '@/lib/push/dispatch'

type Ctx = { params: Promise<{ roomId: string }> }

const Q = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  after: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})

async function assertMember(ctx: Awaited<ReturnType<typeof getApiContext>>, roomId: string, userId: string) {
  const { data } = await ctx.db.from('chat_room_members').select('id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
  if (!data) throw new ApiError('forbidden', 'Join this chat first')
}

export const GET = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await assertMember(ctx, roomId, user.id)
  const q = parseQuery(req, Q)
  let query = ctx.db.from('messages').select(MESSAGE_SELECT).eq('room_id', roomId)
  if (q.after) query = query.gt('created_at', q.after).order('created_at', { ascending: true }).limit(q.limit)
  else {
    query = query.order('created_at', { ascending: false }).limit(q.limit + 1)
    if (q.before) query = query.lt('created_at', q.before)
  }
  const { data, error } = await query
  if (error) throw error
  let rows = (data ?? []) as Record<string, unknown>[]
  const hasMore = !q.after && rows.length > q.limit
  if (!q.after) rows = rows.slice(0, q.limit).reverse()
  return ok({ items: rows.map(toMessage), hasMore })
})

const Body = z.object({ clientId: z.string().uuid(), body: z.string().trim().min(1).max(4000) })

export const POST = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  const { data: dup } = await ctx.db.from('messages').select(MESSAGE_SELECT).eq('user_id', user.id).eq('client_id', b.clientId).maybeSingle()
  if (dup) return ok(toMessage(dup as Record<string, unknown>))
  await assertMember(ctx, roomId, user.id)
  await enforceRateLimit(ctx, 'message')
  const { data, error } = await ctx.db.from('messages').insert({ room_id: roomId, user_id: user.id, content: b.body, message_type: 'text', client_id: b.clientId })
    .select(MESSAGE_SELECT).single()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const { data: again } = await ctx.db.from('messages').select(MESSAGE_SELECT).eq('user_id', user.id).eq('client_id', b.clientId).maybeSingle()
      if (again) return ok(toMessage(again as Record<string, unknown>))
    }
    throw error
  }
  const msg = toMessage(data as Record<string, unknown>)
  after(async () => {
    const svc = ctx.service()
    const { data: room } = await svc.from('chat_rooms').select('type, name').eq('id', roomId).single()
    if (!room || room.type === 'general') return // no pushes for big public rooms
    const { data: members } = await svc.from('chat_room_members').select('user_id').eq('room_id', roomId).neq('user_id', user.id)
    await pushToUsers((members ?? []).map((m) => m.user_id as string), {
      type: 'message', category: 'messages',
      title: room.type === 'direct' ? msg.author.name : `${msg.author.name} · ${room.name}`,
      body: msg.body.slice(0, 140), link: `/chat/${roomId}`,
    })
  })
  return ok(msg, { status: 201 })
})
