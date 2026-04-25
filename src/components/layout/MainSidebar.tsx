'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass, MessageSquare, Trophy, Tent,
  BookOpen, User, Settings, Headphones, Home,
} from 'lucide-react'
import type { Profile } from '@/types'

const mainNav = [
  { href: '/explore',     label: 'Explore',     icon: Compass },
  { href: '/community',   label: 'Community',   icon: MessageSquare },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/host',        label: 'Host',        icon: Tent },
]

const authNav = [
  { href: '/',         label: 'Home',     icon: Home },
  { href: '/bookings', label: 'Bookings', icon: BookOpen },
  { href: '/profile',  label: 'Profile',  icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function MainSidebar({ user }: { user: Profile | null }) {
  const pathname = usePathname()

  // Community pages have their own sidebar (ChatSidebar)
  if (pathname?.startsWith('/community')) return null

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || (pathname?.startsWith(href + '/') ?? false)
  }

  return (
    <aside className="hidden lg:flex flex-col w-52 min-w-[208px] sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-border bg-sidebar shrink-0">
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {mainNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        {user && (
          <>
            <div className="my-3 mx-1 border-t border-border" />
            {authNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Need Help card */}
      <div className="p-3 shrink-0">
        <Link
          href="/support"
          className="flex items-center gap-3 p-3 rounded-xl bg-secondary border border-border hover:bg-secondary/80 transition-colors"
        >
          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Headphones className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Need help?</p>
            <p className="text-xs text-muted-foreground">24/7 Support</p>
          </div>
        </Link>
      </div>
    </aside>
  )
}
