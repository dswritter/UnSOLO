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

  // Chat routes (community / tribe / chat) render their own purpose-built
  // bottom bar. Suppress the global one there so it doesn't overlap the
  // typing input or shift the chat layout.
  const onChatRoute =
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/tribe') ||
    pathname?.startsWith('/chat')
  if (onChatRoute) return null

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
              // CRITICAL: prefetch={false}. The bottom nav has 5 always-visible
              // links. Default prefetch fires 5 concurrent RSC requests when the
              // page mounts — each runs through the middleware and may try to
              // refresh the Supabase JWT. Supabase refresh tokens are single-use,
              // so the second concurrent refresh fails, the proxy reads
              // session=null, and the next click bounces to /login. Disabling
              // prefetch here makes navigation sequential (one request per click),
              // which keeps mobile sessions stable.
              prefetch={false}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold transition-colors',
                isActive ? 'text-primary' : 'text-white/72 hover:text-white',
              )}
            >
              {/* Active state stays as colour-only — never fill the icon, otherwise
                  identifiable shapes (Compass, Tent) lose their wireframe lines. */}
              <Icon className="h-4.5 w-4.5 shrink-0 stroke-[2]" />
              <span className="truncate text-center leading-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
