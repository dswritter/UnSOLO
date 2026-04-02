'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Trophy, Compass, LogOut, User, BookOpen, Menu, X, Shield, Users, Gift, Pencil, Tent } from 'lucide-react'
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
import { getInitials } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { NotificationBell } from './NotificationBell'

interface NavbarProps {
  user?: Profile | null
}

export function Navbar({ user }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

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
      }, async (payload) => {
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

  // Clear unread count when navigating to community
  useEffect(() => {
    if (pathname?.startsWith('/community')) {
      setUnreadChatCount(0)
    }
  }, [pathname])

  const navLinks = [
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/community', label: 'Hangout', icon: Users, showBadge: true },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/host', label: 'Host', icon: Tent },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-primary">UN</span>
              <span className="text-foreground">SOLO</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(({ href, label, icon: Icon, showBadge }) => (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
                {label}
                {showBadge && unreadChatCount > 0 && (
                  <span className="absolute -top-2 -right-3 h-4 min-w-[16px] px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell userId={user.id} />
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Avatar className="h-9 w-9 border border-border cursor-pointer">
                      <AvatarImage src={user.avatar_url || ''} alt={user.full_name || user.username} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {getInitials(user.full_name || user.username)}
                      </AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold truncate">{user.full_name || user.username}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push(`/profile/${user.username}`)}>
                      <User className="mr-2 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/profile')}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/bookings')}>
                      <BookOpen className="mr-2 h-4 w-4" /> My Trips
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/referrals')}>
                      <Gift className="mr-2 h-4 w-4 text-primary" /> Refer & Earn
                    </DropdownMenuItem>
                    {user.role && user.role !== 'user' && (
                      <DropdownMenuItem onClick={() => router.push('/admin')}>
                        <Shield className="mr-2 h-4 w-4 text-red-400" /> Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => signOut()}
                    >
                      <LogOut className="mr-2 h-4 w-4" /> Sign Out
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
              className="md:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-2">
          {navLinks.map(({ href, label, icon: Icon, showBadge }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
              {showBadge && unreadChatCount > 0 && (
                <span className="ml-auto h-5 min-w-[20px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </Link>
          ))}
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
