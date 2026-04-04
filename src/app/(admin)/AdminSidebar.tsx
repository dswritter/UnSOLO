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
} from 'lucide-react'
import { useState } from 'react'

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'social_media_manager', 'field_person', 'chat_responder'] },
  { href: '/admin/bookings', label: 'Bookings', icon: BookOpen, roles: ['admin', 'social_media_manager', 'field_person', 'chat_responder'] },
  { href: '/admin/requests', label: 'Custom Requests', icon: FileText, roles: ['admin', 'social_media_manager', 'field_person'] },
  { href: '/admin/packages', label: 'Packages', icon: Package, roles: ['admin'] },
  { href: '/admin/community-trips', label: 'Community Trips', icon: Mountain, roles: ['admin'] },
  { href: '/admin/discounts', label: 'Discounts', icon: Tag, roles: ['admin'] },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { href: '/admin/team', label: 'Team', icon: Users, roles: ['admin'] },
]

interface AdminSidebarProps {
  role: UserRole
  name: string
  userId: string
}

export function AdminSidebar({ role, name, userId }: AdminSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = role === 'admin'
  const visible = navItems.filter(n => n.roles.includes(role))

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-black">
            <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">
            {isAdmin ? 'ADMIN' : 'STAFF'}
          </span>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visible.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs text-muted-foreground truncate">{name}</span>
          <AdminNotificationBell userId={userId} />
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
      <aside className="hidden md:flex w-56 min-w-[224px] border-r border-border flex-col h-screen sticky top-0 bg-background">
        {sidebarContent}
      </aside>

      {/* Mobile: toggle button + drawer */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center shadow-lg"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-64 z-50 bg-background border-r border-border flex flex-col">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
