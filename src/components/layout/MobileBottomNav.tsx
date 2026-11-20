'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CircleUserRound, Compass, Plus, Ticket, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './AuthProvider'
import { MobileYouSheet } from './MobileYouSheet'
import { ComposeSheet } from '@/components/tribe/ComposeSheet'
import { activeMobileTab, myTripsHref, type MobileTabId } from './mobileNav'

type NavItem = {
  id: MobileTabId
  href?: string
  label: string
  icon: typeof Compass
  badgeCount?: number
}

const noopSubscribe = () => () => {}

export function MobileBottomNav() {
  const { userId, profile } = useAuth()
  const pathname = usePathname()
  const [sheetPath, setSheetPath] = useState<string | null>(null)
  // Tied to the path it was opened on, so any navigation closes the sheet.
  const sheetOpen = sheetPath !== null && sheetPath === pathname
  const closeSheet = useCallback(() => setSheetPath(null), [])
  // "What are you sharing?" sheet from the centre + (tied to the path like the You sheet).
  const [composePath, setComposePath] = useState<string | null>(null)
  const composeOpen = composePath !== null && composePath === pathname
  const closeCompose = useCallback(() => setComposePath(null), [])

  // ALL hooks must come before any conditional return (Rules of Hooks).
  // Server snapshot is false so SSR and hydration match; the client snapshot
  // reads the UA token afterwards.
  const isAndroidShell = useSyncExternalStore(
    noopSubscribe,
    () => navigator.userAgent.includes('UnsoloAndroid'),
    () => false,
  )

  // Unread message badge + conditional label. We mirror the Navbar's realtime
  // subscription so the user sees a counter on the mobile nav even though the
  // top Navbar is hidden on home/explore. Initial unread count comes from
  // chat_room_members.last_read_at vs message timestamps.
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasRooms, setHasRooms] = useState(false)

  // Read current pathname inside the realtime handler without re-subscribing the
  // channel on every navigation (pathname is NOT in the effect deps below).
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

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
            if (!p?.startsWith('/community')) {
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
  // Entering a chat route clears the badge (state adjusted during render).
  const [clearedForPath, setClearedForPath] = useState<string | null>(null)
  if (pathname?.startsWith('/community') && clearedForPath !== pathname) {
    setClearedForPath(pathname)
    if (unreadCount !== 0) setUnreadCount(0)
  }

  // All early returns after all hooks.
  if (isAndroidShell) return null

  // Chat + status routes render their own purpose-built bars. Suppress the
  // global one there so it doesn't overlap the typing input / status grid.
  const onChatRoute =
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/status') ||
    pathname === '/tribe/new'
  // Detail pages pin their own primary action at the bottom (thumb reach) instead of the tab bar.
  const onDetailRoute = pathname?.startsWith('/packages/') || pathname?.startsWith('/tribe/p/')
  if (onChatRoute || onDetailRoute) return null

  const activeTab = sheetOpen ? 'you' : activeMobileTab(pathname)
  void hasRooms
  // Unread chat messages badge the My trips tab (trip + plan group chats live there).
  const items: NavItem[] = [
    { id: 'explore', href: '/', label: 'Explore', icon: Compass },
    { id: 'tribe', href: '/tribe', label: 'Tribe', icon: UsersRound },
    { id: 'post', href: userId ? '/tribe/new' : '/login?redirectTo=%2Ftribe%2Fnew', label: 'Post', icon: Plus },
    { id: 'trips', href: myTripsHref(!!userId), label: 'My trips', icon: Ticket, badgeCount: unreadCount },
    { id: 'you', label: 'You', icon: CircleUserRound },
  ]

  const itemClass = (isActive: boolean) => cn(
    'relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 px-1 pt-1 text-[11.5px] font-semibold transition-colors [-webkit-tap-highlight-color:transparent]',
    isActive ? 'text-[color:var(--pc-accent-ink)]' : 'text-[color:var(--pc-ink2)] hover:text-foreground',
  )

  return (
    <>
      {/* Full Circle tab bar: 68px, thumb zone. Centre "+" is a raised pine circle (create). */}
      <nav aria-label="Primary" className="fc-tabbar md:hidden">
        <div className="grid h-[var(--pc-tab-bar)] grid-cols-5 items-center px-1.5">
          {items.map(({ id, href, label, icon: Icon, badgeCount }) => {
            const isActive = activeTab === id
            const isPost = id === 'post'
            const content = isPost ? <>
              <span className="fc-tab-post" aria-hidden><Icon className="h-6 w-6 stroke-[2.5]" /></span>
              <span className="sr-only">{label}</span>
            </> : <>
              <span className={cn('relative inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-[color:var(--pc-pine-soft)]')}>
                {id === 'you' && profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className={cn('h-6 w-6 rounded-full object-cover', isActive && 'ring-2 ring-[color:var(--pc-ink)]')} />
                ) : (
                  <Icon className={cn('h-[22px] w-[22px] shrink-0', isActive ? 'stroke-[2.4]' : 'stroke-[2]')} />
                )}
                {badgeCount && badgeCount > 0 ? (
                  <span className="pc-badge" style={{ top: -2, right: 4 }}>{badgeCount > 99 ? '99+' : badgeCount}</span>
                ) : null}
              </span>
              <span className="max-w-full truncate text-center leading-tight">{label}</span>
            </>
            if (isPost && userId) return (
              <button key={id} type="button" aria-haspopup="dialog" aria-expanded={composeOpen} aria-label="Create a post"
                onClick={() => setComposePath(composeOpen ? null : pathname)} className={itemClass(false)}>
                {content}
              </button>
            )
            return href ? (
              <Link key={id} href={href} prefetch={false} aria-current={isActive ? 'page' : undefined} aria-label={isPost ? 'Create a post' : undefined} className={itemClass(isActive)}>
                {content}
              </Link>
            ) : (
              <button key={id} type="button" aria-haspopup="dialog" aria-expanded={sheetOpen}
                onClick={() => setSheetPath(sheetOpen ? null : pathname)} className={itemClass(isActive)}>
                {content}
              </button>
            )
          })}
        </div>
      </nav>
      <MobileYouSheet open={sheetOpen} onClose={closeSheet} profile={profile} signedIn={!!userId} />
      <ComposeSheet open={composeOpen} onClose={closeCompose} />
    </>
  )
}
