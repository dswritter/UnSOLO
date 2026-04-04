import { getAdminDashboardStats } from '@/actions/admin'
import { formatPrice } from '@/types'
import Link from 'next/link'
import { Users, CreditCard, Clock, UserCheck, IndianRupee, BookOpen, ArrowRight, Package, Mountain, Tag, FileText } from 'lucide-react'

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Dashboard</h1>

      {/* Stats — grouped by category */}
      <div className="space-y-4 mb-8">
        {/* Platform overview */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Platform</h3>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card">
              <Users className="h-4 w-4 text-blue-400" />
              <span className="text-lg font-bold text-blue-400">{stats.totalUsers}</span>
              <span className="text-xs text-muted-foreground">Users</span>
            </div>
            <Link href="/admin/team" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:border-cyan-500/30 transition-colors">
              <UserCheck className="h-4 w-4 text-cyan-400" />
              <span className="text-lg font-bold text-cyan-400">{stats.teamCount}</span>
              <span className="text-xs text-muted-foreground">Team</span>
            </Link>
          </div>
        </div>

        {/* Bookings */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bookings</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/bookings" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors">
              <BookOpen className="h-4 w-4 text-purple-400" />
              <span className="text-lg font-bold text-purple-400">{stats.totalBookings}</span>
              <span className="text-xs text-muted-foreground">Total Bookings</span>
            </Link>
            <Link href="/admin/bookings?status=confirmed" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:border-green-500/30 transition-colors">
              <CreditCard className="h-4 w-4 text-green-400" />
              <span className="text-lg font-bold text-green-400">{stats.confirmedBookings}</span>
              <span className="text-xs text-muted-foreground">Confirmed</span>
            </Link>
          </div>
        </div>

        {/* Requests & Revenue */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requests & Revenue</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/requests" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors">
              <Clock className="h-4 w-4 text-yellow-400" />
              <span className="text-lg font-bold text-yellow-400">{stats.pendingRequests}</span>
              <span className="text-xs text-muted-foreground">Custom Date Requests</span>
            </Link>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5">
              <IndianRupee className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold text-primary">{formatPrice(stats.totalRevenue)}</span>
              <span className="text-xs text-muted-foreground">Net Revenue</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-bold mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { href: '/admin/bookings', icon: BookOpen, title: 'Manage Bookings', desc: 'View, assign POC, manage cancellations' },
          { href: '/admin/requests', icon: FileText, title: 'Custom Requests', desc: 'Review custom date requests' },
          { href: '/admin/packages', icon: Package, title: 'Manage Packages', desc: 'Create, edit packages & destinations' },
          { href: '/admin/community-trips', icon: Mountain, title: 'Community Trips', desc: 'Approve host-created trips' },
          { href: '/admin/discounts', icon: Tag, title: 'Discounts', desc: 'Manage promo codes & offers' },
          { href: '/admin/team', icon: Users, title: 'Team Management', desc: 'Manage staff & roles' },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href} className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
