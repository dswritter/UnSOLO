import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseQuery, route } from '@/lib/api/http'
import { requireStaffPermission } from '@/lib/api/staff'

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  await requireStaffPermission(ctx, 'analytics')
  const { days } = parseQuery(req, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }))
  const { data, error } = await ctx.service().rpc('admin_analytics_overview', { p_days: days })
  if (error) throw error
  return ok(data)
})
