'use client'

import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Gift, LogOut, Pencil, Shield, User } from 'lucide-react'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { ColorModeToggle } from '@/components/layout/ColorModeToggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from '@/hooks/useSignOut'
import { getInitials } from '@/lib/utils'

type MobileAccountProfile = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
}

const subscribeToEnvironment = () => () => {}
const getAndroidShellSnapshot = () => navigator.userAgent.includes('UnsoloAndroid')
const getAndroidShellServerSnapshot = () => false

export function WanderMobileAccountMenu({ profile }: { profile: MobileAccountProfile }) {
  const router = useRouter()
  const signOut = useSignOut()
  const isAndroidShell = useSyncExternalStore(subscribeToEnvironment, getAndroidShellSnapshot, getAndroidShellServerSnapshot)

  return <>
    <ColorModeToggle className="h-8 w-8" />
    <NotificationBell userId={profile.id} wanderNav />
    {!isAndroidShell && <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
        <Avatar className="h-9 w-9 border-2 border-foreground/20">
          <AvatarImage src={profile.avatar_url || ''} alt={profile.full_name || profile.username} />
          <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
            {getInitials(profile.full_name || profile.username)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-modal z-[200] w-60 min-w-[15rem] rounded-xl p-0 text-foreground shadow-lg ring-0">
        <div className="px-4 py-3">
          <p className="truncate text-base font-semibold">{profile.full_name || profile.username}</p>
          <p className="text-sm text-foreground/65">@{profile.username}</p>
        </div>
        <DropdownMenuSeparator className="bg-foreground/15" />
        <DropdownMenuItem className="py-2.5 text-sm text-foreground/95 focus:bg-foreground/10 focus:text-foreground" onClick={() => router.push(`/profile/${profile.username}`)}>
          <User className="mr-3 h-4 w-4" /> My Profile
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5 text-sm text-foreground/95 focus:bg-foreground/10 focus:text-foreground" onClick={() => router.push('/profile')}>
          <Pencil className="mr-3 h-4 w-4" /> Edit Profile
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5 text-sm text-foreground/95 focus:bg-foreground/10 focus:text-foreground" onClick={() => router.push('/bookings')}>
          <BookOpen className="mr-3 h-4 w-4" /> My Bookings
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5 text-sm text-foreground/95 focus:bg-foreground/10 focus:text-foreground" onClick={() => router.push('/referrals')}>
          <Gift className="mr-3 h-4 w-4 text-primary" /> Refer &amp; Earn
        </DropdownMenuItem>
        {profile.role && profile.role !== 'user' && <DropdownMenuItem className="py-2.5 text-sm text-foreground/95 focus:bg-foreground/10 focus:text-foreground" onClick={() => router.push('/admin')}>
          <Shield className="mr-3 h-4 w-4 text-red-400" /> Admin Panel
        </DropdownMenuItem>}
        <DropdownMenuSeparator className="bg-foreground/15" />
        <DropdownMenuItem className="py-2.5 text-sm text-destructive focus:bg-red-500/15 focus:text-red-700 dark:focus:text-red-300" onClick={() => void signOut()}>
          <LogOut className="mr-3 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>}
  </>
}
