'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Trophy, Compass, LogOut, User, BookOpen, Shield, Gift, Pencil, Tent, MessageSquare, ChevronDown, Plus, Ticket, UsersRound, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from '@/hooks/useSignOut'
import { getInitials, cn } from '@/lib/utils'
import { useState, useEffect, useTransition, useCallback, useRef, type MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMobileChatComposerActive } from '@/hooks/useMobileChatComposerActive'
import { useAuth } from './AuthProvider'
import { NotificationBell } from './NotificationBell'
import { ColorModeToggle } from './ColorModeToggle'
import { SearchBar } from './SearchBar'
import { ComposeSheet } from '@/components/tribe/ComposeSheet'

export function Navbar() {
  // Auth resolves client-side (the shell is statically rendered). `authPending`
  // shows a neutral avatar skeleton — instead of Sign In / Join — until the
  // first resolution completes, so a signed-in user never flashes logged-out.
  const { profile: user, loading } = useAuth()
  const authPending = loading && !user
  const [composeOpen, setComposeOpen] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingJoinCount, setPendingJoinCount] = useState(0)
  const [hasRooms, setHasRooms] = useState(false)
  const [isAndroidShell, setIsAndroidShell] = useState(false)
  const mobileChatComposerActive = useMobileChatComposerActive()
  const router = useRouter()
  const pathname = usePathname()
  const signOut = useSignOut()
  const [isTribeNavPending, startTribeNavTransition] = useTransition()
  const prefetchTribeRoutes = useCallback(() => {
    router.prefetch('/community')
    router.prefetch('/tribe')
  }, [router])

  function onTribeNavClick(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (href !== '/community') return
    if (e.defaultPrevented) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    startTribeNavTransition(() => {
      router.push(href)
    })
  }
  const isWanderShell =
    pathname === '/' ||
    pathname?.startsWith('/tribe') ||
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/host') ||
    pathname?.startsWith('/leaderboard') ||
    pathname?.startsWith('/packages') ||
    pathname?.startsWith('/listings') ||
    pathname?.startsWith('/bookings') ||
    pathname?.startsWith('/booking/') ||
    pathname?.startsWith('/book/')
  const hideGlobalSearch =
    pathname === '/' ||
    pathname?.startsWith('/leaderboard') ||
    pathname?.startsWith('/host') ||
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/tribe')
  const onMobileChatRoom =
    Boolean(pathname?.startsWith('/community/')) ||
    Boolean(pathname?.startsWith('/tribe/')) ||
    Boolean(pathname?.startsWith('/chat/'))

  function navLinkActive(href: string): boolean {
    if (href === '/tribe') return pathname === '/tribe' || Boolean(pathname?.startsWith('/tribe/'))
    if (href === '/bookings') return pathname === '/bookings' || Boolean(pathname?.startsWith('/bookings/'))
    if (href === '/community') {
      return pathname === '/community' || Boolean(pathname?.startsWith('/community/'))
    }
    if (href === '/') {
      return pathname === '/'
    }
    return pathname === href
  }

  /** Avoid re-subscribing realtime on every route change */
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // Track unread messages for Community badge — realtime filtered to rooms this user is in.
  // Previously: unfiltered messages INSERT + chat_room_members query on *every* message app-wide.
  useEffect(() => {
    if (!user) return
    const viewerId = user.id

    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

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
        .channel(`navbar-unread:${viewerId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter,
          },
          (payload: { new: Record<string, unknown> }) => {
            const msg = payload.new as { user_id: string; message_type: string }
            if (msg.user_id === viewerId || msg.message_type === 'system') return
            const p = pathnameRef.current
            if (!p?.startsWith('/community') && !p?.startsWith('/tribe')) {
              setUnreadChatCount(prev => prev + 1)
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
      // Reuse this fetch for the "Meet Travellers" → "Community" label switch —
      // avoids a second `chat_room_members` query for the same information.
      setHasRooms(roomIds.length > 0)
      subscribe(roomIds)
    }

    void loadRoomsAndSubscribe()
    const interval = setInterval(() => void loadRoomsAndSubscribe(), 120_000)
    const onFocus = () => void loadRoomsAndSubscribe()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user])

  // Same account on another device marked messages read — keep badge in sync
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const ch = supabase
      .channel('navbar-read-sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const r = payload.new as { user_id: string }
          if (r.user_id !== user.id) return
          setUnreadChatCount(prev => Math.max(0, prev - 1))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  // Fetch pending join request count for hosts
  useEffect(() => {
    if (!user?.is_host) return
    const supabase = createClient()

    async function fetchPending() {
      // Single query via embedded join instead of packages-then-join_requests round trips.
      const { count } = await supabase
        .from('join_requests')
        .select('*, trip:packages!inner(host_id)', { count: 'exact', head: true })
        .eq('trip.host_id', user!.id)
        .eq('status', 'pending')
      setPendingJoinCount(count ?? 0)
    }

    fetchPending()

    let debounce: ReturnType<typeof setTimeout> | null = null
    const ch = supabase
      .channel('navbar-join-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests' }, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => void fetchPending(), 1200)
      })
      .subscribe()

    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(ch)
    }
  }, [user])

  useEffect(() => {
    if (navigator.userAgent.includes('UnsoloAndroid')) setIsAndroidShell(true)
  }, [])

  if (isAndroidShell) {
    // Home page and chat rooms have their own profile/bell — return null to
    // avoid duplicating icons that already live in the page body.
    const hasOwnHeader =
      pathname === '/' ||
      pathname?.startsWith('/community/') ||
      pathname?.startsWith('/tribe/') ||
      pathname?.startsWith('/chat/')
    if (hasOwnHeader || !user) return null

    // For every other page (Leaderboard, Community list, Offers, Hosting…):
    // just the notification bell — Profile tab in bottom nav handles profile navigation.
    return (
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1">
        <ColorModeToggle />
        <NotificationBell userId={user.id} wanderNav />
      </div>
    )
  }

  // Passenger Chart IA: Explore (book) · Tribe (community posts) · My trips. Post, Messages and
  // Activity sit on the right of every page; Leaderboard and Hosting live under the avatar menu.
  void hasRooms
  const navLinks = [
    { href: '/', label: 'Explore', icon: Compass },
    { href: '/tribe', label: 'Tribe', icon: UsersRound },
    { href: user ? '/bookings' : '/login?redirectTo=%2Fbookings', label: 'My trips', icon: Ticket },
  ]
  const hostActive = Boolean(pathname?.startsWith('/host'))

  return (
    <nav
      className={cn(
        'sticky! top-0 z-50 border-b',
        (pathname === '/' || pathname?.startsWith('/packages/')) && 'max-md:hidden',
        onMobileChatRoom && 'max-md:hidden',
        isWanderShell ? 'glass-navbar border-[color:var(--wander-nav-outer-border)]' : 'border-border bg-background/90 backdrop-blur-md',
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="pc-wordmark text-[22px]" aria-label="UnSOLO"><b>UN</b>SOLO</span>
          </Link>

          {/* Desktop Nav — bottom-aligned so the active underline reads like screenshot tabs */}
          <div className="hidden md:flex items-end justify-center gap-8 flex-1 self-stretch min-h-16">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = navLinkActive(href.split('?')[0])
              const isTribeLink = href === '/community'
              return (
              <Link
                key={href}
                href={href}
                prefetch
                onMouseEnter={isTribeLink ? prefetchTribeRoutes : undefined}
                onFocusCapture={isTribeLink ? prefetchTribeRoutes : undefined}
                onClick={e => onTribeNavClick(e, href)}
                className={cn(
                  'relative flex items-center gap-1.5 text-sm font-medium transition-colors pb-3',
                  isTribeLink && isTribeNavPending && 'opacity-80',
                  isWanderShell
                    ? isActive
                      ? 'text-foreground font-bold border-b-[3px] border-[color:var(--pc-pine)] border-solid -mb-px'
                      : 'text-foreground/70 hover:text-foreground border-b-[3px] border-transparent border-solid -mb-px'
                    : isActive
                      ? 'text-foreground font-bold border-b-[3px] border-[color:var(--pc-pine)] border-solid -mb-px'
                      : 'text-muted-foreground hover:text-foreground border-b-[3px] border-transparent border-solid -mb-px',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
            })}
          </div>

          {/* Search — hidden on /wander (local search lives in page) */}
          {!hideGlobalSearch && (
            <>
              <div className="hidden md:block w-56 mx-4">
                <SearchBar />
              </div>
            </>
          )}

          {/* Right side */}
          <div className="flex items-center gap-1 md:gap-2">
            {user ? (
              <button type="button" onClick={() => setComposeOpen(true)} className="pc-btn pc-btn-sm hidden md:inline-flex" aria-haspopup="dialog" aria-label="Create a post">
                <Plus className="h-4 w-4" aria-hidden /> Post
              </button>
            ) : (
              <Link href="/login?redirectTo=%2Ftribe%2Fnew" prefetch={false} className="pc-btn pc-btn-sm hidden md:inline-flex" aria-label="Create a post">
                <Plus className="h-4 w-4" aria-hidden /> Post
              </Link>
            )}
            {user && (
              <Link href="/community" prefetch={false} onMouseEnter={prefetchTribeRoutes} className="pc-iconbtn" aria-label={unreadChatCount > 0 ? `Messages, ${unreadChatCount} unread` : 'Messages'}>
                <MessageSquare className="h-5 w-5" aria-hidden />
                {unreadChatCount > 0 && <span className="pc-badge">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}
              </Link>
            )}
            <Link
              href="/host"
              prefetch
              className={cn(
                'relative hidden h-10 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors lg:inline-flex',
                hostActive
                  ? 'border-[color:var(--pc-pine)] bg-[color:var(--pc-pine-soft)] text-[color:var(--pc-pine)]'
                  : 'border-border bg-transparent text-foreground hover:border-[color:var(--pc-rule2)]',
              )}
            >
              <Tent className="h-4 w-4" />
              {user?.is_host ? 'Hosting' : 'Become a host'}
              {user?.is_host && pendingJoinCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {pendingJoinCount > 99 ? '99+' : pendingJoinCount}
                </span>
              )}
            </Link>
            <ColorModeToggle />
            {user ? (
              <>
                <NotificationBell userId={user.id} wanderNav={isWanderShell} />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    className={cn(
                      'outline-none focus-visible:ring-2',
                      isWanderShell
                        ? 'group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent py-1.5 pl-1 pr-2 hover:bg-transparent data-[state=open]:bg-transparent data-[popup-open]:bg-transparent focus-visible:ring-primary/45'
                        : 'focus-visible:ring-ring data-[state=open]:bg-secondary/80 inline-flex cursor-pointer border-0 bg-transparent p-0',
                    )}
                  >
                    {isWanderShell ? (
                      <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                        <Avatar className="h-8 w-8 shrink-0 border-2 border-foreground/20 sm:h-9 sm:w-9">
                          <AvatarImage src={user.avatar_url || ''} alt={user.full_name || user.username} />
                          <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                            {getInitials(user.full_name || user.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden min-w-0 max-w-[min(20vw,200px)] truncate text-left text-sm font-semibold text-foreground transition-colors group-hover:text-primary group-data-[popup-open]:text-primary md:inline">
                          {user.full_name || user.username}
                        </span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-foreground transition-colors group-hover:text-primary group-data-[popup-open]:text-primary"
                          aria-hidden
                        />
                      </span>
                    ) : (
                      <Avatar className="h-11 w-11 border-2 border-border transition-colors hover:border-primary/50">
                        <AvatarImage src={user.avatar_url || ''} alt={user.full_name || user.username} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                          {getInitials(user.full_name || user.username)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className={cn(
                      'z-[200] min-w-[15rem] shadow-lg',
                      isWanderShell
                        ? 'glass-modal w-60 rounded-xl p-0 text-foreground shadow-lg ring-0'
                        : 'border-border bg-popover text-popover-foreground',
                    )}
                  >
                    <div className="px-4 py-3">
                      <p className="text-base font-semibold truncate text-inherit">{user.full_name || user.username}</p>
                      <p className={cn('text-sm', isWanderShell ? 'text-foreground/65' : 'text-muted-foreground')}>
                        @{user.username}
                      </p>
                    </div>
                    <DropdownMenuSeparator className={isWanderShell ? 'bg-foreground/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push(`/profile/${user.username}`)}
                    >
                      <User className="mr-3 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push('/profile')}
                    >
                      <Pencil className="mr-3 h-4 w-4" /> Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push('/bookings')}
                    >
                      <BookOpen className="mr-3 h-4 w-4" /> My Bookings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push('/leaderboard')}
                    >
                      <Trophy className="mr-3 h-4 w-4" /> Leaderboard
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push('/settings')}
                    >
                      <Settings className="mr-3 h-4 w-4" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                      onClick={() => router.push('/referrals')}
                    >
                      <Gift className="mr-3 h-4 w-4" /> Refer & Earn
                    </DropdownMenuItem>
                    {user.role && user.role !== 'user' && (
                      <DropdownMenuItem
                        className={cn('py-2.5 text-sm', isWanderShell && 'text-foreground/95 focus:bg-foreground/10 focus:text-foreground')}
                        onClick={() => router.push('/admin')}
                      >
                        <Shield className="mr-3 h-4 w-4 text-red-400" /> Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className={isWanderShell ? 'bg-foreground/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm text-destructive', isWanderShell && 'focus:bg-red-500/15 focus:text-red-700 dark:focus:text-red-300')}
                      onClick={() => signOut()}
                    >
                      <LogOut className="mr-3 h-4 w-4" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : authPending ? (
              // Profile still streaming — placeholder avatar, no logged-out flash.
              <div
                className="h-10 w-10 rounded-full bg-foreground/10 animate-pulse"
                aria-hidden
              />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/signup">Join free</Link>
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
      <ComposeSheet open={composeOpen} onClose={() => setComposeOpen(false)} />
    </nav>
  )
}
