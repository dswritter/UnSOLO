'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Trophy, Compass, LogOut, User, BookOpen, Shield, Users, Gift, Pencil, Tent, MessageSquare, ChevronDown } from 'lucide-react'
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
import { useState, useEffect, useTransition, useCallback, type MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { NotificationBell } from './NotificationBell'
import { SearchBar } from './SearchBar'

interface NavbarProps {
  user?: Profile | null
}

export function Navbar({ user }: NavbarProps) {
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingJoinCount, setPendingJoinCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
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

  function navLinkActive(href: string): boolean {
    if (href === '/community') {
      return (
        pathname === '/community' ||
        Boolean(pathname?.startsWith('/community/')) ||
        pathname === '/tribe' ||
        Boolean(pathname?.startsWith('/tribe/'))
      )
    }
    if (href === '/') {
      return pathname === '/'
    }
    return pathname === href
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
        if (!pathname?.startsWith('/community') && !pathname?.startsWith('/tribe')) {
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
    { href: '/', label: 'Explore', icon: Compass },
    { href: '/community', label: 'Meet Travellers', icon: MessageSquare, showBadge: true },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/host', label: user?.is_host ? 'Hosting' : 'Become a Host', icon: Tent, showHostBadge: user?.is_host },
  ]

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 border-b',
        pathname === '/' && 'max-md:hidden',
        isWanderShell ? 'glass-navbar border-[color:var(--wander-nav-outer-border)]' : 'border-border bg-background/90 backdrop-blur-md',
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-primary">UN</span>
              <span className={isWanderShell ? 'text-white' : 'text-foreground'}>SOLO</span>
            </span>
          </Link>

          {/* Desktop Nav — bottom-aligned so the active underline reads like screenshot tabs */}
          <div className="hidden md:flex items-end justify-center gap-8 flex-1 self-stretch min-h-16">
            {navLinks.map(({ href, label, icon: Icon, showBadge, showHostBadge }) => {
              const isActive = navLinkActive(href)
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
                      ? 'text-primary border-b-[3px] border-primary border-solid -mb-px'
                      : /* avoid hover:text-white — :root .hover\\:text-white:hover forces dark text in light mode */
                        'text-white/90 hover:text-primary border-b-[3px] border-transparent border-solid -mb-px'
                    : isActive
                      ? 'text-primary border-b-[3px] border-primary border-solid -mb-px'
                      : 'text-muted-foreground hover:text-foreground border-b-[3px] border-transparent border-solid -mb-px',
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
          {!hideGlobalSearch && (
            <>
              <div className="hidden md:block w-56 ml-4">
                <SearchBar />
              </div>
            </>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2 md:gap-3">
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
                        <Avatar className="h-8 w-8 shrink-0 border-2 border-white/20 sm:h-9 sm:w-9">
                          <AvatarImage src={user.avatar_url || ''} alt={user.full_name || user.username} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                            {getInitials(user.full_name || user.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden min-w-0 max-w-[min(20vw,200px)] truncate text-left text-sm font-semibold text-white transition-colors group-hover:text-primary group-data-[popup-open]:text-primary md:inline">
                          {user.full_name || user.username}
                        </span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-white transition-colors group-hover:text-primary group-data-[popup-open]:text-primary"
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
                        ? 'glass-modal w-60 rounded-xl p-0 text-white shadow-lg ring-0'
                        : 'border-border bg-popover text-popover-foreground',
                    )}
                  >
                    <div className="px-4 py-3">
                      <p className="text-base font-semibold truncate text-inherit">{user.full_name || user.username}</p>
                      <p className={cn('text-sm', isWanderShell ? 'text-white/65' : 'text-muted-foreground')}>
                        @{user.username}
                      </p>
                    </div>
                    <DropdownMenuSeparator className={isWanderShell ? 'bg-white/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push(`/profile/${user.username}`)}
                    >
                      <User className="mr-3 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/profile')}
                    >
                      <Pencil className="mr-3 h-4 w-4" /> Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/bookings')}
                    >
                      <BookOpen className="mr-3 h-4 w-4" /> My Bookings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm', isWanderShell && 'text-white/95 focus:bg-white/10 focus:text-white')}
                      onClick={() => router.push('/referrals')}
                    >
                      <Gift className={cn('mr-3 h-4 w-4', isWanderShell && 'text-primary')} /> Refer & Earn
                    </DropdownMenuItem>
                    {user.role && user.role !== 'user' && (
                      <DropdownMenuItem
                        className={cn('py-2.5 text-sm', isWanderShell && 'text-white/95 focus:bg-white/10 focus:text-white')}
                        onClick={() => router.push('/admin')}
                      >
                        <Shield className="mr-3 h-4 w-4 text-red-400" /> Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className={isWanderShell ? 'bg-white/15' : undefined} />
                    <DropdownMenuItem
                      className={cn('py-2.5 text-sm text-destructive', isWanderShell && 'focus:bg-red-500/15 focus:text-red-300')}
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

          </div>
        </div>
      </div>
    </nav>
  )
}
