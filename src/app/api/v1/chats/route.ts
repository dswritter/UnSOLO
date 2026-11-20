import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'
import { listChats } from '@/lib/tribe/chats'

const Q = z.object({ type: z.enum(['trip', 'direct', 'general']).optional(), cursor: z.string().max(200).optional() })

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const q = parseQuery(req, Q)
  const offset = decodeCursor(q.cursor)?.offset ?? 0
  const { items, hasMore } = await listChats(ctx.db, user.id, q.type, 30, offset)
  return ok({ items, nextCursor: hasMore ? encodeCursor({ offset: offset + 30 }) : null })
})
