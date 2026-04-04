import { getAdminDashboardStats } from '@/actions/admin'
import { formatPrice } from '@/types'
import Link from 'next/link'
import { Users, CreditCard, Clock, UserCheck, IndianRupee, BookOpen, Package, FileText, Settings, Mountain, ArrowRight } from 'lucide-react'

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Compact stats row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/admin/bookings" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-blue-500/30 transition-colors">
          <Users className="h-4 w-4 text-blue-400" />
          <span className="text-lg font-bold text-blue-400">{stats.totalUsers}</span>
          <span className="text-xs text-muted-foreground">Users</span>
        </Link>
        <Link href="/admin/bookings" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors">
          <BookOpen className="h-4 w-4 text-purple-400" />
          <span className="text-lg font-bold text-purple-400">{stats.totalBookings}</span>
          <span className="text-xs text-muted-foreground">Bookings</span>
        </Link>
        <Link href="/admin/bookings" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-green-500/30 transition-colors">
          <CreditCard className="h-4 w-4 text-green-400" />
          <span className="text-lg font-bold text-green-400">{stats.confirmedBookings}</span>
          <span className="text-xs text-muted-foreground">Confirmed</span>
        </Link>
        <Link href="/admin/requests" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-yellow-500/30 transition-colors">
          <Clock className="h-4 w-4 text-yellow-400" />
          <span className="text-lg font-bold text-yellow-400">{stats.pendingRequests}</span>
          <span className="text-xs text-muted-foreground">Pending</span>
        </Link>
        <Link href="/admin/team" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-cyan-500/30 transition-colors">
          <UserCheck className="h-4 w-4 text-cyan-400" />
          <span className="text-lg font-bold text-cyan-400">{stats.teamCount}</span>
          <span className="text-xs text-muted-foreground">Team</span>
        </Link>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
          <IndianRupee className="h-4 w-4 text-primary" />
          <span className="text-lg font-bold text-primary">{formatPrice(stats.totalRevenue)}</span>
          <span className="text-xs text-muted-foreground">Revenue</span>
        </div>
      </div>

      {/* Quick actions grid */}
      <h2 className="text-lg font-bold mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Link href="/admin/bookings" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Manage Bookings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">View, assign POC, confirmations</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link href="/admin/requests" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Custom Requests</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Review custom date requests</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link href="/admin/packages" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Manage Packages</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Create, edit packages & destinations</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link href="/admin/community-trips" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Community Trips</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Approve host-created trips</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link href="/admin/discounts" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Discounts</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Manage promo codes & offers</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link href="/admin/team" className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Team Management</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Manage staff & roles</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  )
}
