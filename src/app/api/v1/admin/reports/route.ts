import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { requireStaffPermission } from '@/lib/api/staff'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'
import { loadModerationQueue } from '@/lib/moderation/queue'

const Q = z.object({ state: z.enum(['open', 'in_review', 'actioned', 'dismissed']).default('open'), cursor: z.string().max(200).optional() })

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  await requireStaffPermission(ctx, 'moderation')
  const q = parseQuery(req, Q)
  const offset = decodeCursor(q.cursor)?.offset ?? 0
  const r = await loadModerationQueue(ctx.service(), q.state, 30, offset)
  return ok({ ...r, nextCursor: r.hasMore ? encodeCursor({ offset: offset + 30 }) : null })
})
