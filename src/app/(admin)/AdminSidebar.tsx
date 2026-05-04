'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminNotificationBell } from './AdminNotificationBell'
import type { UserRole } from '@/types'
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
  Store,
} from 'lucide-react'
import { useState } from 'react'

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[]; badgeKey?: string }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'social_media_manager', 'field_person', 'chat_responder'] },
  { href: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
  { href: '/admin/bookings', label: 'Bookings', icon: BookOpen, roles: ['admin', 'social_media_manager', 'field_person', 'chat_responder'], badgeKey: 'bookings' },
  { href: '/admin/requests', label: 'Custom Requests', icon: FileText, roles: ['admin', 'social_media_manager', 'field_person'], badgeKey: 'requests' },
  { href: '/admin/packages', label: 'Packages', icon: Package, roles: ['admin'] },
  { href: '/admin/service-listings', label: 'Service Listings', icon: Store, roles: ['admin'], badgeKey: 'serviceListings' },
  { href: '/admin/community-trips', label: 'Community Trips', icon: Mountain, roles: ['admin'], badgeKey: 'communityTrips' },
  { href: '/admin/community-chats', label: 'Community chats', icon: MessageCircle, roles: ['admin', 'social_media_manager'] },
  { href: '/admin/revenue', label: 'Revenue', icon: Tag, roles: ['admin'] },
  { href: '/admin/discounts', label: 'Discounts', icon: Tag, roles: ['admin'] },
  { href: '/admin/offers', label: 'Offers Page', icon: Sparkles, roles: ['admin'] },
  { href: '/admin/promo-cards', label: 'Home promos', icon: Sparkles, roles: ['admin'] },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['admin'] },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { href: '/admin/team', label: 'Team', icon: Users, roles: ['admin'] },
]

interface AdminSidebarProps {
  role: UserRole
  name: string
  userId: string
  pendingCounts?: { bookings: number; requests: number; serviceListings: number; communityTrips: number }
}

export function AdminSidebar({ role, name, userId, pendingCounts }: AdminSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = role === 'admin'
  const visible = navItems.filter(n => n.roles.includes(role))
  const counts = pendingCounts ?? { bookings: 0, requests: 0, serviceListings: 0, communityTrips: 0 }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="shrink-0 px-4 py-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-black">
            <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-amber-500/15 text-amber-100 border-amber-500/35">
            {isAdmin ? 'Admin' : 'Staff'}
          </span>
        </Link>
      </div>

      {/* Nav links — scrolls; header/footer stay fixed in column */}
      <nav className="min-h-0 flex-1 px-3 py-3 space-y-0.5 overflow-y-auto [scrollbar-gutter:stable]">
        {visible.map(({ href, label, icon: Icon, badgeKey }) => {
          const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href))
          const badgeCount = badgeKey ? counts[badgeKey as keyof typeof counts] : 0
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary/18 text-primary font-semibold shadow-sm shadow-black/10'
                  : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/80'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badgeCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold px-1 shadow-sm">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
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
