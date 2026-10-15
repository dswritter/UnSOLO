import { getAdminDashboardStats } from '@/actions/admin'
import { getEffectiveAdminRole } from '@/lib/auth/admin-permissions'
import { hasAdminPermission } from '@/types'
import type { AdminPermissionKey, UserRole } from '@/types'
import Link from 'next/link'
import {
  Users,
  CreditCard,
  Clock,
  UserCheck,
  BookOpen,
  ChevronRight,
  Package,
  Mountain,
  Tag,
  FileText,
  AlertTriangle,
  MessageCircle,
  Sparkles,
  Store,
  Phone,
  UserPlus,
  CheckCircle2,
  IndianRupee,
} from 'lucide-react'

type Icon = typeof Users

function fmtPrice(paise: number) {
  if (paise === 0) return '₹0'
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
}

export default async function AdminDashboardPage() {
  const [stats, session] = await Promise.all([
    getAdminDashboardStats(),
    getEffectiveAdminRole(),
  ])

  const role: UserRole = session?.role ?? 'user'
  const customPermissions: AdminPermissionKey[] = session?.customPermissions ?? []
  const can = (key: AdminPermissionKey) => hasAdminPermission(role, customPermissions, key)
  const isAdmin = role === 'admin'

  const attention: { href: string; icon: Icon; label: string; count: number; urgent?: boolean; show: boolean }[] = [
    { href: '/admin/bookings?cancellation=requested', icon: AlertTriangle, label: 'Cancellation requests', count: stats.cancellationRequested, urgent: true, show: can('bookings') },
    { href: '/admin/service-listings?status=pending', icon: Store, label: 'Service listings to review', count: stats.pendingServiceListings, show: can('service_listings') },
    { href: '/admin/community-trips?status=pending', icon: Mountain, label: 'Community trips to review', count: stats.pendingCommunityTrips, show: can('community_trips') },
    { href: '/admin/trip-claims', icon: UserPlus, label: 'Trip claims', count: stats.pendingTripClaims, show: can('trip_claims') },
    { href: '/admin/phone-verifications', icon: Phone, label: 'Phone verifications', count: stats.pendingPhoneVerifications, show: can('phone_verifications') },
    { href: '/admin/requests', icon: FileText, label: 'Custom date requests', count: stats.pendingDateRequests, show: can('requests') },
    { href: '/admin/bookings?status=pending', icon: Clock, label: 'Bookings awaiting payment', count: stats.pendingBookings, show: can('bookings') },
  ]
  const visibleAttention = attention.filter(item => item.show)
  const openItems = visibleAttention.filter(item => item.count > 0)

  const metrics: { href: string; icon: Icon; label: string; value: string; show: boolean }[] = [
    { href: '/admin/revenue', icon: IndianRupee, label: 'Net revenue', value: fmtPrice(stats.totalRevenue), show: can('revenue') },
    { href: '/admin/bookings', icon: BookOpen, label: 'Total bookings', value: stats.totalBookings.toLocaleString('en-IN'), show: can('bookings') },
    { href: '/admin/bookings?status=confirmed', icon: CreditCard, label: 'Confirmed', value: stats.confirmedBookings.toLocaleString('en-IN'), show: can('bookings') },
    { href: '/admin/users', icon: Users, label: 'Users', value: stats.totalUsers.toLocaleString('en-IN'), show: isAdmin },
    { href: '/admin/team', icon: UserCheck, label: 'Team', value: stats.teamCount.toLocaleString('en-IN'), show: isAdmin },
  ]
  const visibleMetrics = metrics.filter(metric => metric.show)

  const shortcuts: { href: string; icon: Icon; label: string; permissionKey: AdminPermissionKey }[] = [
    { href: '/admin/users', icon: Users, label: 'Users', permissionKey: 'users' },
    { href: '/admin/bookings', icon: BookOpen, label: 'Bookings', permissionKey: 'bookings' },
    { href: '/admin/packages', icon: Package, label: 'Packages', permissionKey: 'packages' },
    { href: '/admin/service-listings', icon: Store, label: 'Service listings', permissionKey: 'service_listings' },
    { href: '/admin/community-trips', icon: Mountain, label: 'Community trips', permissionKey: 'community_trips' },
    { href: '/admin/community-chats', icon: MessageCircle, label: 'Community chats', permissionKey: 'community_chats' },
    { href: '/admin/discounts', icon: Tag, label: 'Discounts', permissionKey: 'discounts' },
    { href: '/admin/offers', icon: Sparkles, label: 'Offers page', permissionKey: 'offers' },
  ]
  const visibleShortcuts = shortcuts.filter(shortcut => can(shortcut.permissionKey))

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {openItems.length > 0
            ? `${openItems.length} ${openItems.length === 1 ? 'queue needs' : 'queues need'} your attention`
            : 'Everything is up to date'}
        </p>
      </header>

      {visibleAttention.length > 0 && (
        <section>
          <SectionTitle>Needs attention</SectionTitle>
          {openItems.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/90">
              {openItems.map(({ href, icon: ItemIcon, label, count, urgent }) => (
                <li key={href}>
                  <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60">
                    <ItemIcon className={urgent ? 'h-4 w-4 shrink-0 text-rose-400' : 'h-4 w-4 shrink-0 text-muted-foreground'} />
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <span className={urgent
                      ? 'rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-rose-300'
                      : 'rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-300'}>
                      {count > 999 ? '999+' : count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              No pending reviews, claims or requests.
            </div>
          )}
        </section>
      )}

      {visibleMetrics.length > 0 && (
        <section>
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibleMetrics.map(({ href, icon: MetricIcon, label, value }) => (
              <Link key={href} href={href} className="rounded-xl border border-border bg-card/90 p-4 transition-colors hover:border-primary/40">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MetricIcon className="h-3.5 w-3.5" />
                  {label}
                </p>
                <p className="mt-2 truncate text-xl font-bold tabular-nums text-foreground">{value}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {visibleShortcuts.length > 0 && (
        <section>
          <SectionTitle>Shortcuts</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleShortcuts.map(({ href, icon: ShortcutIcon, label }) => (
              <Link key={href} href={href} className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary">
                <ShortcutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
