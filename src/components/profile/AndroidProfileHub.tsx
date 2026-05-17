'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, Pencil, BookOpen, Gift, Shield, LogOut, ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { signOut } from '@/actions/auth'
import { getInitials } from '@/lib/utils'
import type { Profile } from '@/types'

interface AndroidProfileHubProps {
  profile: Profile
}

interface MenuItem {
  icon: React.ElementType
  label: string
  href?: string
  onClick?: () => void
  danger?: boolean
  iconClassName?: string
}

export function AndroidProfileHub({ profile }: AndroidProfileHubProps) {
  const router = useRouter()

  const menuItems: MenuItem[] = [
    {
      icon: User,
      label: 'My Profile',
      href: `/profile/${profile.username}`,
    },
    {
      icon: Pencil,
      label: 'Edit Profile',
      href: '/profile/edit',
    },
    {
      icon: BookOpen,
      label: 'My Bookings',
      href: '/bookings',
    },
    {
      icon: Gift,
      label: 'Refer & Earn',
      href: '/referrals',
      iconClassName: 'text-primary',
    },
    ...(profile.role && profile.role !== 'user'
      ? [
          {
            icon: Shield,
            label: 'Admin Panel',
            href: '/admin',
            iconClassName: 'text-red-400',
          } as MenuItem,
        ]
      : []),
  ]

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Profile header */}
      <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-12">
        <Avatar className="h-24 w-24 border-4 border-white/20 shadow-xl">
          <AvatarImage src={profile.avatar_url || ''} alt={profile.full_name || profile.username} />
          <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
            {getInitials(profile.full_name || profile.username)}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="text-xl font-bold">{profile.full_name || profile.username}</p>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
        <Link
          href={`/profile/${profile.username}`}
          className="mt-1 rounded-full border border-border px-5 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
        >
          View profile
        </Link>
      </div>

      {/* Menu list */}
      <div className="mx-4 overflow-hidden rounded-2xl border border-border/60 bg-card">
        {menuItems.map((item, idx) => {
          const Icon = item.icon
          const isLast = idx === menuItems.length - 1
          const inner = (
            <div
              className={`flex items-center gap-3.5 px-4 py-3.5 ${!isLast ? 'border-b border-border/50' : ''}`}
            >
              <Icon className={`h-5 w-5 shrink-0 text-muted-foreground ${item.iconClassName ?? ''}`} />
              <span className="flex-1 text-base font-medium">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </div>
          )

          if (item.href) {
            return (
              <Link key={item.label} href={item.href}>
                {inner}
              </Link>
            )
          }
          return (
            <button key={item.label} className="w-full text-left" onClick={item.onClick}>
              {inner}
            </button>
          )
        })}
      </div>

      {/* Sign out */}
      <div className="mx-4 mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
        <button
          className="w-full text-left"
          onClick={() => signOut()}
        >
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <LogOut className="h-5 w-5 shrink-0 text-destructive" />
            <span className="flex-1 text-base font-medium text-destructive">Sign Out</span>
          </div>
        </button>
      </div>

      {/* bottom padding for nav bar */}
      <div className="h-20" />
    </div>
  )
}
