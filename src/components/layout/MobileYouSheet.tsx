'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { ChevronRight, Gift, LogIn, LogOut, Moon, Pencil, Shield, Sun, Tent, Trophy, User, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useColorMode } from '@/components/layout/ColorModeToggle'
import { useSignOut } from '@/hooks/useSignOut'
import { cn, getInitials } from '@/lib/utils'
import type { Profile } from '@/types'
import { youMenuItems, type YouMenuItem } from './mobileNav'

const ICONS: Record<YouMenuItem['id'], typeof User> = {
  profile: User,
  'edit-profile': Pencil,
  hosting: Tent,
  leaderboard: Trophy,
  offers: Gift,
  referrals: Gift,
  admin: Shield,
}

/** Bottom sheet for secondary destinations so the tab bar can stay at four items. */
export function MobileYouSheet({ open, onClose, profile, signedIn }: {
  open: boolean
  onClose: () => void
  profile: Profile | null
  signedIn: boolean
}) {
  const { mode, toggle } = useColorMode()
  const signOut = useSignOut()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const viewer = signedIn ? { username: profile?.username ?? null, isHost: !!profile?.is_host, role: profile?.role ?? null } : null
  const items = youMenuItems(viewer)
  const name = profile?.full_name || profile?.username || ''
  const dark = mode === 'dark'

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="You">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-foreground/10 bg-card pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-12px_40px_rgba(0,0,0,0.25)] outline-none"
      >
        <div className="sticky top-0 flex items-center justify-between bg-card px-5 pb-2 pt-3">
          <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/20" />
          {signedIn && profile ? (
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <Avatar className="h-11 w-11 border-2 border-primary/30">
                <AvatarImage src={profile.avatar_url || ''} alt="" />
                <AvatarFallback className="bg-primary text-sm font-bold text-primary-foreground">{getInitials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-bold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-base font-bold">{signedIn ? 'You' : 'Welcome to UnSOLO'}</p>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[0.06]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!signedIn ? (
          <div className="grid grid-cols-2 gap-2 px-5 pb-3 pt-1">
            <Link href="/login" onClick={onClose} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-foreground/14 text-sm font-bold">
              <LogIn className="h-4 w-4" />Sign in
            </Link>
            <Link href="/signup" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              Join free
            </Link>
          </div>
        ) : null}

        <ul className="px-3">
          {items.map(item => {
            const Icon = ICONS[item.id]
            return (
              <li key={item.id}>
                <Link href={item.href} onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-foreground/[0.05]">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06]', item.id === 'admin' ? 'text-red-500' : 'text-primary')}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    {item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mx-5 my-2 border-t border-foreground/10" />
        <div className="px-3">
          <button type="button" onClick={toggle} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-foreground/[0.05]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-primary">
              {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </span>
            <span className="flex-1 text-sm font-semibold">{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          {signedIn ? (
            <button type="button" onClick={() => { onClose(); void signOut() }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-destructive hover:bg-red-500/10">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10"><LogOut className="h-4.5 w-4.5" /></span>
              <span className="flex-1 text-sm font-semibold">Sign out</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
