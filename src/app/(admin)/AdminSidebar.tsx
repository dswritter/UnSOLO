'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getAdminSidebarCounts } from '@/actions/admin'
import { AdminCommandPalette } from '@/components/admin/ui/AdminCommandPalette'
import { ColorModeToggle } from '@/components/layout/ColorModeToggle'
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/layout/NotificationBell'
import { AdminNotificationBell } from './AdminNotificationBell'
import type { UserRole, AdminPermissionKey } from '@/types'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Package,
  Mountain,
  Tag,
  Settings,
  Users,
  ArrowLeft,
  Menu,
  X,
  MessageCircle,
  Sparkles,
  LifeBuoy,
  Store,
  UserPlus,
  FilePen,
  Phone,
  ShieldCheck,
  MessagesSquare,
  IndianRupee,
  Megaphone,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
  badgeKey?: 'bookings' | 'requests' | 'serviceListings' | 'communityTrips'
  permissionKey?: AdminPermissionKey
}

const ALL_STAFF: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder', 'host_onboarding_staff', 'custom']

const navGroups: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ALL_STAFF }] },
  {
    label: 'Operations',
    items: [
      { href: '/admin/bookings', label: 'Bookings', icon: BookOpen, roles: ['admin', 'social_media_manager', 'field_person', 'chat_responder'], badgeKey: 'bookings', permissionKey: 'bookings' },
      { href: '/admin/requests', label: 'Custom requests', icon: FileText, roles: ['admin', 'social_media_manager', 'field_person'], badgeKey: 'requests', permissionKey: 'requests' },
      { href: '/admin/trip-claims', label: 'Trip claims', icon: UserPlus, roles: ['admin'], permissionKey: 'trip_claims' },
      { href: '/admin/recover-payments', label: 'Recover payments', icon: LifeBuoy, roles: ['admin'], permissionKey: 'bookings' },
    ],
  },
  {
    label: 'Listings',
    items: [
      { href: '/admin/packages', label: 'UnSOLO trips', icon: Package, roles: ['admin'], permissionKey: 'packages' },
      { href: '/admin/community-trips', label: 'Community trips', icon: Mountain, roles: ['admin', 'host_onboarding_staff'], badgeKey: 'communityTrips', permissionKey: 'community_trips' },
      { href: '/admin/service-listings', label: 'Service listings', icon: Store, roles: ['admin', 'host_onboarding_staff'], badgeKey: 'serviceListings', permissionKey: 'service_listings' },
      { href: '/admin/host-drafts', label: 'Drafts in progress', icon: FilePen, roles: ['admin', 'host_onboarding_staff'], permissionKey: 'community_trips' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users, roles: ['admin'], permissionKey: 'users' },
      { href: '/admin/phone-verifications', label: 'Phone verifications', icon: Phone, roles: ['admin', 'host_onboarding_staff'], permissionKey: 'phone_verifications' },
      { href: '/admin/team', label: 'Team', icon: ShieldCheck, roles: ['admin'], permissionKey: 'team' },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/admin/community-chats', label: 'Community chats', icon: MessageCircle, roles: ['admin', 'social_media_manager', 'chat_responder'], permissionKey: 'community_chats' },
      { href: '/admin/trip-groups', label: 'Trip groups', icon: MessagesSquare, roles: ['admin', 'social_media_manager'], permissionKey: 'community_trips' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/admin/revenue', label: 'Revenue', icon: IndianRupee, roles: ['admin'], permissionKey: 'revenue' },
      { href: '/admin/discounts', label: 'Discounts', icon: Tag, roles: ['admin'], permissionKey: 'discounts' },
      { href: '/admin/offers', label: 'Offers page', icon: Sparkles, roles: ['admin'], permissionKey: 'offers' },
      { href: '/admin/promo-cards', label: 'Home promos', icon: Megaphone, roles: ['admin'], permissionKey: 'promo_cards' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/whatsapp', label: 'WhatsApp', icon: Phone, roles: ['admin'], permissionKey: 'whatsapp' },
      { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'], permissionKey: 'settings' },
    ],
  },
]

interface AdminSidebarProps {
  role: UserRole
  name: string
  userId: string
  customPermissions?: AdminPermissionKey[]
}

// Pages whose loaders write (team role sync) are only prefetched on intent.
const NO_FULL_PREFETCH = new Set(['/admin/team'])
const SETTINGS_NAV_ITEM = navGroups.flatMap(group => group.items).find(item => item.href === '/admin/settings')!
const NOTIFICATION_REFRESH_PATHS = ['/admin/bookings', '/admin/requests', '/admin/service-listings', '/admin/trip-claims', '/admin/community-trips'] as const
const EMPTY_COUNTS = { bookings: 0, requests: 0, serviceListings: 0, communityTrips: 0, notificationsResolved: 0 }

export function AdminSidebar({ role, name, userId, customPermissions = [] }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = role === 'admin'

  // For 'custom' role: show dashboard always + items whose permissionKey is in customPermissions
  // For all other roles: filter by the roles array
  const canSee = (n: NavItem) =>
    n.roles.includes(role) || (role === 'custom' && !!n.permissionKey && customPermissions.includes(n.permissionKey))
  const visibleGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(canSee) }))
    .filter(group => group.items.length > 0)

  const [counts, setCounts] = useState(EMPTY_COUNTS)

  const [countsVersion, setCountsVersion] = useState(0)

  // Badges load after the page paints (and after each admin action/navigation), never blocking render.
  useEffect(() => {
    let cancelled = false
    getAdminSidebarCounts().then(next => {
      if (cancelled) return
      setCounts(next)
      if (next.notificationsResolved > 0) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pathname, countsVersion])

  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Actions taken on the current page (no navigation) also clear queues; re-check periodically and on focus.
  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setCountsVersion(v => v + 1) }
    const interval = setInterval(bump, 45_000)
    document.addEventListener('visibilitychange', bump)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    // Badges always update; the open page reloads only when the event concerns it.
    const scheduleReload = (refreshOn: readonly string[]) => () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setCountsVersion(v => v + 1)
        const path = pathnameRef.current ?? ''
        if (refreshOn.some(prefix => path.startsWith(prefix))) router.refresh()
      }, 800)
    }
    const supabase = createClient()
    const channel = supabase
      .channel(`admin-sidebar-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        scheduleReload(NOTIFICATION_REFRESH_PATHS),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
          filter: 'moderation_status=eq.pending',
        },
        scheduleReload(['/admin/community-trips']),
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [userId, router])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-black">
            <span className="brand-gold">UN</span><span className="text-foreground">SOLO</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-amber-500/15 text-amber-800 dark:text-amber-100 border-amber-500/35">
            {isAdmin ? 'Admin' : 'Staff'}
          </span>
        </Link>
        <ColorModeToggle className="h-8 w-8" />
      </div>

      <div className="shrink-0 px-3 pt-3">
        <AdminCommandPalette
          pages={visibleGroups.flatMap(group => group.items.map(item => ({ href: item.href, label: item.label, group: group.label ?? 'Admin', icon: item.icon })))}
          includeSettings={canSee(SETTINGS_NAV_ITEM)}
        />
      </div>

      {/* Nav links — scrolls; header/footer stay fixed in column */}
      <nav className="min-h-0 flex-1 px-3 py-3 space-y-0.5 overflow-y-auto [scrollbar-gutter:stable]">
        {visibleGroups.map(group => (
          <div key={group.label ?? 'main'} className={group.label ? 'pt-3' : undefined}>
            {group.label ? (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{group.label}</p>
            ) : null}
            {group.items.map(({ href, label, icon: Icon, badgeKey }) => {
              const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href))
              const badgeCount = badgeKey ? counts[badgeKey] : 0
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={NO_FULL_PREFETCH.has(href) ? null : true}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/18 text-primary font-semibold'
                      : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/80'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1 tabular-nums">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — pinned to viewport bottom via parent h-dvh + flex column */}
      <div className="shrink-0 px-3 py-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs text-sidebar-foreground/75 truncate">{name}</span>
          <AdminNotificationBell userId={userId} />
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to site
        </Link>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-dvh max-h-dvh w-[260px] min-w-[260px] shrink-0 flex-col overflow-hidden border-r border-sidebar-border md:flex md:flex-col md:self-start md:sticky md:top-0 bg-sidebar/95 backdrop-blur-md shadow-[4px_0_24px_-12px_rgba(0,0,0,0.35)]">
        {sidebarContent}
      </aside>

      {/* Mobile: toggle button + drawer */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-10 w-10 rounded-xl bg-card/95 border border-border flex items-center justify-center shadow-lg shadow-black/30 text-foreground"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex w-[280px] max-w-[min(280px,92vw)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
