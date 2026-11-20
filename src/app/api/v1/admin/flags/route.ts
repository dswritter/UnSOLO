import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { requireStaffPermission } from '@/lib/api/staff'

const FLAG_KEYS = ['tribe_enabled', 'tribe_posting_enabled', 'host_offers_enabled', 'push_enabled', 'tribe_rollout_percent', 'min_app_version_android', 'min_app_version_ios'] as const

const Body = z.object({
  key: z.enum(FLAG_KEYS),
  value: z.string().max(10).regex(/^(true|false|\d{1,6})$/),
})

/** Kill switches + rollout (docs/revamp/product-spec.md §5). Every change is audit-logged. */
export const PUT = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const staff = await requireStaffPermission(ctx, 'settings')
  const b = await parseJson(req, Body)
  if (b.key === 'tribe_rollout_percent' && Number(b.value) > 100) b.value = '100'
  const svc = ctx.service()
  const { error } = await svc.from('platform_settings').upsert({ key: b.key, value: b.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
  await svc.from('audit_logs').insert({ admin_id: staff.userId, action: 'settings.flag', target_type: 'platform_setting', target_id: b.key, details: { value: b.value } })
  return ok({ key: b.key, value: b.value })
})
