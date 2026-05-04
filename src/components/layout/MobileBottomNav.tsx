'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Gift, MessageSquare, Tent, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: typeof Compass
  active: (pathname: string | null) => boolean
}

export function MobileBottomNav({ isHost = false }: { isHost?: boolean }) {
  const pathname = usePathname()

  const items: NavItem[] = [
    {
      href: '/leaderboard',
      label: 'Leaderboard',
      icon: Trophy,
      active: (p) => p === '/leaderboard',
    },
    {
      href: '/',
      label: 'Explore',
      icon: Compass,
      active: (p) =>
        p === '/' ||
        Boolean(p?.startsWith('/packages')) ||
        Boolean(p?.startsWith('/listings')) ||
        Boolean(p?.startsWith('/booking/')) ||
        Boolean(p?.startsWith('/book/')) ||
        Boolean(p?.startsWith('/bookings')),
    },
    {
      href: '/community',
      label: 'Meet Travellers',
      icon: MessageSquare,
      active: (p) => p === '/community' || Boolean(p?.startsWith('/community/')) || p === '/tribe' || Boolean(p?.startsWith('/tribe/')),
    },
    {
      href: '/offers',
      label: 'Offers',
      icon: Gift,
      active: (p) => p === '/offers',
    },
    {
      href: isHost ? '/host' : '/host/verify',
      label: isHost ? 'Hosting' : 'Become Host',
      icon: Tent,
      active: (p) => Boolean(p?.startsWith('/host')),
    },
  ]

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.4rem)]">
      <div className="grid grid-cols-5 gap-1 px-2 pb-1 pt-2">
        {items.map(({ href, label, icon: Icon, active }) => {
          const isActive = active(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold transition-colors',
                isActive ? 'text-primary' : 'text-white/72 hover:text-white',
              )}
            >
              <Icon className={cn('h-4.5 w-4.5 shrink-0 stroke-[1.9]', isActive && 'fill-current')} />
              <span className="truncate text-center leading-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
