import { requireAdminPagePermission } from '@/lib/auth/admin-page'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'
import { ControlsClient } from './ControlsClient'

export const dynamic = 'force-dynamic'

export default async function ControlsPage() {
  await requireAdminPagePermission('settings')
  const { data } = await createServiceRoleClient().from('platform_settings').select('key, value, updated_at')
    .in('key', ['tribe_enabled', 'tribe_posting_enabled', 'host_offers_enabled', 'push_enabled', 'tribe_rollout_percent', 'min_app_version_android', 'min_app_version_ios'])
  const values = Object.fromEntries((data ?? []).map((r) => [r.key, String(r.value)]))
  return (
    <div>
      <AdminPageHeader title="App controls" description="Kill switches and rollout for web, Android and iOS. Apps re-read these on launch and every 15 minutes." />
      <ControlsClient initial={values} />
    </div>
  )
}
