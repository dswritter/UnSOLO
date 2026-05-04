import { getAdminDashboardStats } from '@/actions/admin'
import Link from 'next/link'
import { Users, CreditCard, Clock, UserCheck, BookOpen, ArrowRight, Package, Mountain, Tag, FileText, AlertTriangle, MessageCircle, Sparkles } from 'lucide-react'

function fmtPrice(paise: number) {
  if (paise === 0) return '₹0'
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats()

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Overview and shortcuts — Wander admin</p>

      {/* Stats grouped by category */}
      <div className="space-y-4 mb-8">
        {/* Platform */}
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Platform</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card/90 hover:border-sky-500/40 transition-colors shadow-sm shadow-black/10">
              <Users className="h-4 w-4 text-sky-300" />
              <span className="text-lg font-bold text-sky-200">{stats.totalUsers}</span>
              <span className="text-xs text-muted-foreground">Users</span>
            </Link>
            <Link href="/admin/team" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card/90 hover:border-emerald-500/35 transition-colors shadow-sm shadow-black/10">
              <UserCheck className="h-4 w-4 text-emerald-300" />
              <span className="text-lg font-bold text-emerald-200">{stats.teamCount}</span>
              <span className="text-xs text-muted-foreground">Team</span>
            </Link>
          </div>
        </div>

        {/* Bookings */}
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bookings</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/bookings" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card/90 hover:border-violet-500/35 transition-colors shadow-sm shadow-black/10">
              <BookOpen className="h-4 w-4 text-violet-300" />
              <span className="text-lg font-bold text-violet-200">{stats.totalBookings}</span>
              <span className="text-xs text-muted-foreground">All Bookings</span>
            </Link>
            <Link href="/admin/bookings?status=confirmed" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card/90 hover:border-emerald-500/40 transition-colors shadow-sm shadow-black/10">
              <CreditCard className="h-4 w-4 text-emerald-300" />
              <span className="text-lg font-bold text-emerald-200">{stats.confirmedBookings}</span>
              <span className="text-xs text-muted-foreground">Confirmed</span>
            </Link>
            <Link href="/admin/bookings?status=pending" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card/90 hover:border-amber-500/40 transition-colors shadow-sm shadow-black/10">
              <Clock className="h-4 w-4 text-amber-300" />
              <span className="text-lg font-bold text-amber-200">{stats.pendingBookings}</span>
              <span className="text-xs text-muted-foreground">Pending Payment</span>
            </Link>
            {stats.cancellationRequested > 0 && (
              <Link href="/admin/bookings?cancellation=requested" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/15 transition-colors shadow-sm shadow-black/10">
                <AlertTriangle className="h-4 w-4 text-rose-300" />
                <span className="text-lg font-bold text-rose-200">{stats.cancellationRequested}</span>
                <span className="text-xs text-muted-foreground">Cancel Requests</span>
              </Link>
            )}
          </div>
        </div>

        {/* Requests & Revenue */}
        <div>
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requests & Revenue</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/requests" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/15 transition-colors shadow-sm shadow-black/10">
              <FileText className="h-4 w-4 text-amber-300" />
              <span className="text-lg font-bold text-amber-200">{stats.pendingDateRequests}</span>
              <span className="text-xs text-muted-foreground">Custom Date Requests</span>
            </Link>
            <Link href="/admin/revenue" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/15 transition-colors shadow-sm shadow-black/10">
              <span className="text-lg font-bold text-primary">{fmtPrice(stats.totalRevenue)}</span>
              <span className="text-xs text-muted-foreground">Net Revenue</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-bold text-foreground mb-3">Quick actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {([
          { href: '/admin/users', icon: Users, title: 'Manage Users', desc: 'Search, filter, view user details', badge: 0 },
          { href: '/admin/bookings', icon: BookOpen, title: 'Manage Bookings', desc: 'View, assign POC, manage cancellations', badge: 0 },
          { href: '/admin/requests', icon: FileText, title: 'Custom Requests', desc: 'Review custom date requests', badge: stats.pendingDateRequests },
          { href: '/admin/packages', icon: Package, title: 'Manage Packages', desc: 'Create, edit packages & destinations', badge: 0 },
          { href: '/admin/service-listings', icon: Tag, title: 'Service Listings', desc: 'Create stays, activities, rentals', badge: stats.pendingServiceListings },
          { href: '/admin/community-trips', icon: Mountain, title: 'Community Trips', desc: 'Approve host-created trips', badge: stats.pendingCommunityTrips },
          { href: '/admin/community-chats', icon: MessageCircle, title: 'Community chats', desc: 'Rooms, images, enable/disable', badge: 0 },
          { href: '/admin/discounts', icon: Tag, title: 'Discounts', desc: 'Manage promo codes & offers', badge: 0 },
          { href: '/admin/offers', icon: Sparkles, title: 'Offers Page', desc: 'Arrange section order and bundle rows', badge: 0 },
        ] as const).map(({ href, icon: Icon, title, desc, badge }) => (
          <Link
            key={href}
            href={href}
            className={`group rounded-xl border bg-card/90 p-4 shadow-sm shadow-black/10 hover:border-primary/40 transition-colors ${
              badge > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Icon className="h-4 w-4 text-primary" />
                  {badge > 0 && (
                    <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white leading-none shadow-sm">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                  {badge > 0 && (
                    <p className="text-[10px] text-amber-300/90 font-medium mt-0.5">
                      {badge} pending review
                    </p>
                  )}
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
