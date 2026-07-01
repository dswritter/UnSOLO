'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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

  // ALL hooks must come before any conditional return (Rules of Hooks).
  // isAndroidShell starts false so SSR and first hydration match; useEffect
  // flips it true on the client when the UA token is present.
  const [isAndroidShell, setIsAndroidShell] = useState(false)
  useEffect(() => {
    if (navigator.userAgent.includes('UnsoloAndroid')) setIsAndroidShell(true)
  }, [])

  // Unread message badge + conditional label. We mirror the Navbar's realtime
  // subscription so the user sees a counter on the mobile nav even though the
  // top Navbar is hidden on home/explore. Initial unread count comes from
  // chat_room_members.last_read_at vs message timestamps.
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasRooms, setHasRooms] = useState(false)

  // Read current pathname inside the realtime handler without re-subscribing the
  // channel on every navigation (pathname is NOT in the effect deps below).
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (!userId || isAndroidShell) return
    const viewerId = userId
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // Subscribe filtered to the user's own rooms — avoids receiving (and running
    // a membership query for) every message inserted anywhere on the platform.
    function subscribe(roomIds: string[]) {
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }
      if (roomIds.length === 0) return
      const filter =
        roomIds.length === 1
          ? `room_id=eq.${roomIds[0]}`
          : `room_id=in.(${roomIds.join(',')})`
      channel = supabase
        .channel(`mobile-nav-unread:${viewerId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter },
          (payload: { new: Record<string, unknown> }) => {
            const msg = payload.new as { user_id: string; message_type: string }
            if (msg.user_id === viewerId || msg.message_type === 'system') return
            // Don't bump while the user is actively in the chat section.
            const p = pathnameRef.current
            if (!p?.startsWith('/community') && !p?.startsWith('/tribe')) {
              setUnreadCount(prev => prev + 1)
              setHasRooms(true)
            }
          },
        )
        .subscribe()
    }

    async function loadRoomsAndSubscribe() {
      const { data } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', viewerId)
      if (cancelled) return
      const roomIds = [...new Set((data ?? []).map(r => r.room_id).filter(Boolean))] as string[]
      setHasRooms(roomIds.length > 0)
      subscribe(roomIds)
    }

    void loadRoomsAndSubscribe()
    // Re-check room membership periodically / on refocus so newly-joined rooms
    // start counting without a full reload.
    const interval = setInterval(() => void loadRoomsAndSubscribe(), 120_000)
    const onFocus = () => void loadRoomsAndSubscribe()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, isAndroidShell])

  // Clear the badge when the user actually walks into the chat section.
  useEffect(() => {
    if (pathname?.startsWith('/community') || pathname?.startsWith('/tribe')) {
      setUnreadCount(0)
    }
  }, [pathname])

  // All early returns after all hooks.
  if (isAndroidShell) return null

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
