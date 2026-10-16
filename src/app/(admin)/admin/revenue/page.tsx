export const dynamic = 'force-dynamic'

import { getRequestAuth } from '@/lib/auth/request-session'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

function fmtPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

type RevenueBreakdown = {
  grossRevenue: number
  totalRefunds: number
  packageBreakdown: { title: string; slug: string; revenue: number; bookings: number }[]
  userBreakdown: { name: string; username: string; spent: number; bookings: number }[]
}

// Revenue = cash actually collected (deposit_paise, else total) for confirmed/completed bookings, minus approved refunds.
async function loadRevenueBreakdown(): Promise<RevenueBreakdown> {
  const svc = createSvcClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await svc.rpc('admin_revenue_breakdown', { p_user_limit: 20 })
  if (!error && data) {
    const r = data as { gross: number; refunds: number; packages: RevenueBreakdown['packageBreakdown']; users: RevenueBreakdown['userBreakdown'] }
    return {
      grossRevenue: Number(r.gross) || 0,
      totalRefunds: Number(r.refunds) || 0,
      packageBreakdown: (r.packages || []).map(p => ({ ...p, revenue: Number(p.revenue) || 0 })),
      userBreakdown: (r.users || []).map(u => ({ ...u, spent: Number(u.spent) || 0 })),
    }
  }

  // Fallback until migration 112 is applied.
  const { data: bookings } = await svc
    .from('bookings')
    .select('deposit_paise, total_amount_paise, refund_amount_paise, cancellation_status, status, user_id, package:packages(title, slug), user:profiles!bookings_user_id_fkey(username, full_name)')
    .in('status', ['confirmed', 'completed'])
  const packageMap = new Map<string, RevenueBreakdown['packageBreakdown'][number]>()
  const userMap = new Map<string, RevenueBreakdown['userBreakdown'][number]>()
  let grossRevenue = 0
  let totalRefunds = 0
  for (const b of bookings || []) {
    const pkg = b.package as unknown as { title: string; slug: string } | null
    const usr = b.user as unknown as { username: string; full_name: string | null } | null
    const amount = b.deposit_paise && b.deposit_paise > 0 ? b.deposit_paise : (b.total_amount_paise || 0)
    const refund = b.cancellation_status === 'approved' ? (b.refund_amount_paise || 0) : 0
    grossRevenue += amount
    totalRefunds += refund
    if (pkg) {
      const key = pkg.slug || pkg.title
      const entry = packageMap.get(key) || { title: pkg.title, slug: pkg.slug, revenue: 0, bookings: 0 }
      entry.revenue += amount - refund
      entry.bookings++
      packageMap.set(key, entry)
    }
    if (usr && b.user_id) {
      const entry = userMap.get(b.user_id) || { name: usr.full_name || usr.username, username: usr.username, spent: 0, bookings: 0 }
      entry.spent += amount
      entry.bookings++
      userMap.set(b.user_id, entry)
    }
  }
  return {
    grossRevenue,
    totalRefunds,
    packageBreakdown: [...packageMap.values()].sort((x, y) => y.revenue - x.revenue),
    userBreakdown: [...userMap.values()].sort((x, y) => y.spent - x.spent).slice(0, 20),
  }
}

export default async function AdminRevenuePage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')


  const { grossRevenue, totalRefunds, packageBreakdown, userBreakdown } = await loadRevenueBreakdown()

  return (
    <div>
      <AdminPageHeader title="Revenue" description="Cash collected minus approved refunds." />

      {/* Summary */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div className="px-5 py-3 rounded-xl border border-primary/30 bg-primary/5">
          <p className="text-xs text-muted-foreground">Net Revenue</p>
          <p className="text-2xl font-black text-primary">{fmtPrice(grossRevenue - totalRefunds)}</p>
        </div>
        <div className="px-5 py-3 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground">Gross</p>
          <p className="text-xl font-bold">{fmtPrice(grossRevenue)}</p>
        </div>
        <div className="px-5 py-3 rounded-xl border border-red-500/30 bg-red-500/5">
          <p className="text-xs text-muted-foreground">Refunds</p>
          <p className="text-xl font-bold text-red-400">-{fmtPrice(totalRefunds)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per Package */}
        <div>
          <h2 className="text-lg font-bold mb-3">By Package</h2>
          <div className="space-y-1 border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 px-4 py-2 bg-secondary/50 text-xs font-medium text-muted-foreground">
              <span>Package</span><span className="text-center">Bookings</span><span className="text-right">Revenue</span>
            </div>
            {packageBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No revenue yet</p>
            ) : packageBreakdown.map(p => (
              <div key={p.slug} className="grid grid-cols-3 px-4 py-2.5 border-t border-border/50 items-center">
                <a href={`/packages/${p.slug}`} target="_blank" className="text-sm font-medium truncate text-primary hover:underline">{p.title}</a>
                <span className="text-sm text-center text-muted-foreground">{p.bookings}</span>
                <span className="text-sm text-right font-bold text-primary">{fmtPrice(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per User */}
        <div>
          <h2 className="text-lg font-bold mb-3">By User (Top Spenders)</h2>
          <div className="space-y-1 border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 px-4 py-2 bg-secondary/50 text-xs font-medium text-muted-foreground">
              <span>User</span><span className="text-center">Bookings</span><span className="text-right">Spent</span>
            </div>
            {userBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No revenue yet</p>
            ) : userBreakdown.map(u => (
              <div key={u.username} className="grid grid-cols-3 px-4 py-2.5 border-t border-border/50 items-center">
                <a href={`/profile/${u.username}`} target="_blank" className="text-sm truncate hover:underline">
                  <span className="font-medium text-primary">{u.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">@{u.username}</span>
                </a>
                <span className="text-sm text-center text-muted-foreground">{u.bookings}</span>
                <span className="text-sm text-right font-bold text-primary">{fmtPrice(u.spent)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
