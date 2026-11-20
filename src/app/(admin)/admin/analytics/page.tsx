import Link from 'next/link'
import { requireAdminPagePermission } from '@/lib/auth/admin-page'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'
import { AnalyticsDashboard, type Overview } from './AnalyticsDashboard'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ days?: string }> }
const PRESETS = [7, 30, 90] as const

export default async function AnalyticsPage({ searchParams }: Props) {
  await requireAdminPagePermission('analytics')
  const { days: raw } = await searchParams
  const days = PRESETS.includes(Number(raw) as 7) ? Number(raw) : 30
  const { data, error } = await createServiceRoleClient().rpc('admin_analytics_overview', { p_days: days })
  return (
    <div>
      <AdminPageHeader title="Analytics" description="Web, Android and iOS together. Tribe health metrics are the ones the product spec watches for 90 days." />
      {/* Filters: one row above everything they scope; date range first. */}
      <nav className="mb-6 flex gap-2" aria-label="Date range">
        {PRESETS.map((d) => <Link key={d} href={`/admin/analytics?days=${d}`} className="pc-chip" aria-pressed={d === days}>Last {d} days</Link>)}
      </nav>
      {error || !data
        ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Analytics needs migrations 119–121 applied ({error?.message ?? 'no data'}).</p>
        : <AnalyticsDashboard data={data as Overview} />}
    </div>
  )
}
