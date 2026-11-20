import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { requireStaffPermission } from '@/lib/api/staff'
import { applyModerationAction, MODERATION_ACTIONS } from '@/lib/moderation/actions'
import { dispatchPendingPushes } from '@/lib/push/dispatch'

type Ctx = { params: Promise<{ id: string }> }

export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const staff = await requireStaffPermission(ctx, 'moderation')
  const b = await parseJson(req, z.object({ action: z.enum(MODERATION_ACTIONS), note: z.string().trim().min(3).max(2000) }))
  const r = await applyModerationAction(ctx.service(), { reportId: id, actorId: staff.userId, actorRole: staff.role, action: b.action, note: b.note })
  after(() => dispatchPendingPushes({ limit: 20 }))
  return ok(r)
})
