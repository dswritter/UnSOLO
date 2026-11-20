import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'
import { toNotification } from '@/lib/tribe/models'

const Q = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(50).default(30) })

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const q = parseQuery(req, Q)
  const c = decodeCursor(q.cursor)
  let query = ctx.db.from('notifications').select('id, type, title, body, link, is_read, metadata, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(q.limit + 1)
  if (c?.at) query = query.lt('created_at', c.at)
  const [{ data, error }, { count }] = await Promise.all([
    query,
    ctx.db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
  ])
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  const page = rows.slice(0, q.limit)
  return ok({
    items: page.map(toNotification),
    nextCursor: rows.length > q.limit ? encodeCursor({ at: String(page[page.length - 1].created_at) }) : null,
    unread: count ?? 0,
  })
})
