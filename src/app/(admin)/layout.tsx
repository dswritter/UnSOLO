import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { UserRole } from '@/types'
import { AdminNotificationBell } from './AdminNotificationBell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, username')
    .eq('id', user.id)
    .single()

  const staffRoles: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder']
  if (!profile || !staffRoles.includes(profile.role as UserRole)) {
    redirect('/')
  }

  const isAdmin = profile.role === 'admin'

  const navItems = [
    { href: '/admin', label: 'Dashboard', roles: staffRoles },
    { href: '/admin/bookings', label: 'Bookings', roles: staffRoles },
    { href: '/admin/requests', label: 'Custom Requests', roles: ['admin', 'social_media_manager', 'field_person'] as UserRole[] },
    { href: '/admin/packages', label: 'Packages', roles: ['admin'] as UserRole[] },
    { href: '/admin/community-trips', label: 'Community Trips', roles: ['admin'] as UserRole[] },
    { href: '/admin/discounts', label: 'Discounts', roles: ['admin'] as UserRole[] },
    { href: '/admin/settings', label: 'Settings', roles: ['admin'] as UserRole[] },
    { href: '/admin/team', label: 'Team', roles: ['admin'] as UserRole[] },
  ]

  const visibleNav = navItems.filter(n => n.roles.includes(profile.role as UserRole))

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Admin top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight">
                  <span className="text-primary">UN</span>
                  <span className="text-foreground">SOLO</span>
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">
                  {isAdmin ? 'ADMIN' : 'STAFF'}
                </span>
              </Link>
              <nav className="hidden md:flex items-center gap-1">
                {visibleNav.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <AdminNotificationBell userId={user.id} />
              <span className="text-sm text-muted-foreground">
                {profile.full_name || profile.username}
              </span>
              <Link
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-foreground/30 transition-colors"
              >
                ← Back to site
              </Link>
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden flex gap-1 pb-2 overflow-x-auto">
            {visibleNav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
