'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Compass, Gift, MessageSquare, Tent, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
  icon: typeof Compass
  badgeCount?: number
  active: (pathname: string | null) => boolean
}

export function MobileBottomNav({ isHost = false, userId }: { isHost?: boolean; userId?: string | null }) {
  const pathname = usePathname()

  // Unread message badge + conditional label. We mirror the Navbar's realtime
  // subscription so the user sees a counter on the mobile nav even though the
  // top Navbar is hidden on home/explore. Initial unread count comes from
  // chat_room_members.last_read_at vs message timestamps.
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasRooms, setHasRooms] = useState(false)

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    let cancelled = false

    async function loadState() {
      // Count rooms the user is a member of — drives the label switch
      // ("Meet Travellers" → "Community" once they have any chat at all).
      const { count: roomCount } = await supabase
        .from('chat_room_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!)
      if (cancelled) return
      setHasRooms((roomCount ?? 0) > 0)
    }

    loadState()

    const channel = supabase
      .channel('mobile-nav-unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as { user_id: string; room_id: string; message_type: string }
          if (msg.user_id === userId || msg.message_type === 'system') return
          // Only count messages from rooms the user is in.
          const { data: membership } = await supabase
            .from('chat_room_members')
            .select('id')
            .eq('room_id', msg.room_id)
            .eq('user_id', userId!)
            .maybeSingle()
          if (!membership) return
          // Don't bump while the user is actively in the chat section.
          const onChat = pathname?.startsWith('/community') || pathname?.startsWith('/tribe')
          if (onChat) return
          setUnreadCount(prev => prev + 1)
          setHasRooms(true)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, pathname])

  // Clear the badge when the user actually walks into the chat section.
  useEffect(() => {
    if (pathname?.startsWith('/community') || pathname?.startsWith('/tribe')) {
      setUnreadCount(0)
    }
  }, [pathname])

  // Chat + status routes render their own purpose-built bars. Suppress the
  // global one there so it doesn't overlap the typing input / status grid.
  const onChatRoute =
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/tribe') ||
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/status')
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
      // Once a user has joined any room (DM/community/trip), they're past the
      // "discover travellers" stage — switch the label to "Community" since
      // it's now their existing crowd, not new strangers.
      label: hasRooms ? 'Community' : 'Meet Travellers',
      icon: MessageSquare,
      badgeCount: unreadCount,
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
        {items.map(({ href, label, icon: Icon, active, badgeCount }) => {
          const isActive = active(pathname)
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold transition-colors',
                isActive ? 'text-primary' : 'text-white/72 hover:text-white',
              )}
            >
              {/* Icon column is positioned so we can pin the unread badge to
                  the top-right of the icon without it stealing space from the
                  label below. */}
              <span className="relative inline-flex">
                <Icon className="h-4.5 w-4.5 shrink-0 stroke-[2]" />
                {badgeCount && badgeCount > 0 ? (
                  <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-center leading-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
