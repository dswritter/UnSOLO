'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Trophy, Compass, LogOut, User, BookOpen, Menu, X, Shield, Users, Gift, Pencil, Tent, MessageSquare, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/actions/auth'
import { getInitials, cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { NotificationBell } from './NotificationBell'
import { SearchBar } from './SearchBar'

interface NavbarProps {
  user?: Profile | null
}

export function Navbar({ user }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingJoinCount, setPendingJoinCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const isWander = pathname?.startsWith('/wander')
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileToggleRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Dismiss the mobile menu on outside tap or Escape.
  useEffect(() => {
    if (!mobileOpen) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (mobileMenuRef.current?.contains(target)) return
      if (mobileToggleRef.current?.contains(target)) return
      setMobileOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  // Swipe up or swipe left on the drawer closes it.
  function onMenuTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onMenuTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const SWIPE = 40
    if (dy < -SWIPE && Math.abs(dy) > Math.abs(dx)) { setMobileOpen(false); return }
    if (dx < -SWIPE && Math.abs(dx) > Math.abs(dy)) { setMobileOpen(false); return }
  }

  // Track unread messages for Community badge
  useEffect(() => {
    if (!user) return

    const supabase = createClient()

    // Listen for new messages in rooms the user is a member of
    const channel = supabase
      .channel('navbar-unread')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload: { new: Record<string, unknown> }) => {
        const msg = payload.new as { user_id: string; room_id: string; message_type: string }
        if (msg.user_id === user.id || msg.message_type === 'system') return

        // Check if user is a member
        const { data: membership } = await supabase
          .from('chat_room_members')
          .select('id')
          .eq('room_id', msg.room_id)
          .eq('user_id', user.id)
          .single()

        if (!membership) return

        // Only show badge when NOT on community page
        if (!pathname?.startsWith('/community')) {
          setUnreadChatCount(prev => prev + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, pathname])

  // Same account on another device marked messages read — keep badge in sync
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const ch = supabase
      .channel('navbar-read-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_read_receipts' },
        (payload: { new: Record<string, unknown> }) => {
          const r = payload.new as { user_id: string }
          if (r.user_id !== user.id) return
          setUnreadChatCount(prev => Math.max(0, prev - 1))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  // Clear unread count when navigating to community
  useEffect(() => {
    if (pathname?.startsWith('/community')) {
      setUnreadChatCount(0)
    }
  }, [pathname])

  // Fetch pending join request count for hosts
  useEffect(() => {
    if (!user?.is_host) return
    const supabase = createClient()

    async function fetchPending() {
      // Get all trip IDs hosted by this user
      const { data: trips } = await supabase
        .from('packages')
        .select('id')
        .eq('host_id', user!.id)
      if (!trips?.length) return
      const { count } = await supabase
        .from('join_requests')
        .select('id', { count: 'exact', head: true })
        .in('trip_id', trips.map(t => t.id))
        .eq('status', 'pending')
      setPendingJoinCount(count ?? 0)
    }

    fetchPending()

    const ch = supabase
      .channel('navbar-join-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests' }, () => {
        fetchPending()
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [user])

  const navLinks = [
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/community', label: 'Tribe', icon: MessageSquare, showBadge: true },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/host', label: user?.is_host ? 'Hosting' : 'Become a Host', icon: Tent, showHostBadge: user?.is_host },
  ]

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 border-b',
        isWander ? 'nav-wander-surface border-[#2f4d42]/55' : 'border-border bg-background/90 backdrop-blur-md',
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-primary">UN</span>
              <span className={isWander ? 'text-white' : 'text-foreground'}>SOLO</span>
            </span>
          </Link>

          {/* Desktop Nav - Centered */}
          <div className="hidden md:flex items-center gap-8 flex-1 justify-center">
            {navLinks.map(({ href, label, icon: Icon, showBadge, showHostBadge }) => {
              const isActive = pathname === href
              return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  'relative flex items-center gap-1.5 text-sm font-medium transition-colors',
                  isWander
                    ? isActive
                      ? 'text-[#fcba03] border-b-2 border-[#fcba03] pb-1'
                      : 'text-white/90 hover:text-white'
                    : isActive
                      ? 'text-primary border-b-2 border-primary pb-1'
                      : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {showBadge && unreadChatCount > 0 && (
                  <span className="absolute -top-2 -right-3 h-4 min-w-[16px] px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
                {showHostBadge && pendingJoinCount > 0 && (
                  <span className="absolute -top-2 -right-3 h-4 min-w-[16px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {pendingJoinCount > 99 ? '99+' : pendingJoinCount}
                  </span>
                )}
              </Link>
            )
            })}
          </div>

          {/* Search — hidden on /wander (local search lives in page) */}
          {!isWander && (
            <>
              <div className="hidden md:block w-56 ml-4">
                <SearchBar />
              </div>
              <div className="md:hidden">
                <SearchBar isMobile={true} />
              </div>
            </>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2 md:gap-3">
            {user ? (
              <>
                <NotificationBell userId={user.id} />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    className={cn(
                      'outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary/80',
                      isWander
                        ? 'inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent py-1.5 pl-1 pr-2 hover:bg-secondary/60'
                        : 'inline-flex cursor-pointer border-0 bg-transparent p-0',
                    )}
                  >
                    {isWander ? (
                      <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                        <Avatar className="h-8 w-8 shrink-0 border-2 border-border sm:h-9 sm:w-9">
                          <AvatarImage src={user.avatar_url || ''} alt={user.full_name || user.username} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                            {getInitials(user.full_name || user.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden min-w-0 max-w-[min(20vw,200px)] truncate text-left text-sm font-semibold md:inline">
                          {user.full_name || user.username}
                        </span>
                        <ChevronDown
                          className={cn('h-4 w-4 shrink-0', isWander ? 'text-white/70' : 'text-muted-foreground')}
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
                      'z-[200] w-60 min-w-[15rem] shadow-lg',
                      isWander
                        ? 'border border-white/10 bg-[oklch(0.2_0.045_155_/_0.94)] text-white backdrop-blur-xl'
                        : 'border-border bg-popover text-popover-foreground',
                    )}
                  >
                    <div className="px-4 py-3">
                      <p className="text-base font-semibold truncate text-inherit">{user.full_name || user.username}</p>
                      <p className={cn('text-sm', isWander ? 'text-white/65' : 'text-muted-foreground')}>
                        @{user.username}
                      </p>
                    </div>
                    <DropdownMenuSeparator className={isWander ? 'bg-white/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWander && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push(`/profile/${user.username}`)}
                    >
                      <User className="mr-3 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWander && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/profile')}
                    >
                      <Pencil className="mr-3 h-4 w-4" /> Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWander && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/bookings')}
                    >
                      <BookOpen className="mr-3 h-4 w-4" /> My Trips
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWander && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/referrals')}
                    >
                      <Gift className={cn('mr-3 h-4 w-4', isWander && 'text-[#fcba03]')} /> Refer & Earn
                    </DropdownMenuItem>
                    {user.role && user.role !== 'user' && (
                      <DropdownMenuItem
                        className={cn('py-2.5 text-sm', isWander && 'text-white/95 focus:bg-white/10 focus:text-white')}
                        onClick={() => router.push('/admin')}
                      >
                        <Shield className="mr-3 h-4 w-4 text-red-400" /> Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className={isWander ? 'bg-white/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm text-destructive', isWander && 'focus:bg-red-500/15 focus:text-red-300')}
                      onClick={() => signOut()}
                    >
                      <LogOut className="mr-3 h-4 w-4" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                  <Link href="/signup">Join Free</Link>
                </Button>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              ref={mobileToggleRef}
              className={cn('md:hidden', isWander ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          onTouchStart={onMenuTouchStart}
          onTouchEnd={onMenuTouchEnd}
          className={cn(
            'md:hidden border-t px-4 py-4 space-y-2',
            isWander ? 'border-[#2f4d42]/55 bg-[oklch(0.14_0.038_155)]' : 'border-border bg-background',
          )}
        >
          {navLinks.map(({ href, label, icon: Icon, showBadge, showHostBadge }) => {
            const isActive = pathname === href
            return (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={() => setMobileOpen(false)}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isWander
                  ? isActive
                    ? 'text-[#fcba03] bg-[#fcba03]/12'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                  : isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {showBadge && unreadChatCount > 0 && (
                <span className="ml-auto h-5 min-w-[20px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
              {showHostBadge && pendingJoinCount > 0 && (
                <span className="ml-auto h-5 min-w-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {pendingJoinCount > 99 ? '99+' : pendingJoinCount}
                </span>
              )}
            </Link>
            )
          })}
          {user && (
            <Link
              href="/bookings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              My Trips
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
