'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, CalendarDays, ChevronRight, Compass, CreditCard, Gift, Home, Instagram, Key, Loader2, LogOut, MapPin, Pencil, Plane, Search, Shield, Smile, User, Users } from 'lucide-react'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signOut } from '@/actions/auth'
import type { WanderHeroCopy, WanderHeroMobileTabCopy, WanderStats } from '@/lib/wander/wanderQueries'
import { cn, getInitials } from '@/lib/utils'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'
import { WanderNominatimLocationInput } from '@/components/wander/WanderNominatimLocationInput'

type Tab = 'trips' | 'stays' | 'activities' | 'rentals'

const TABS: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'rentals', label: 'Rentals', icon: Key },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'stays', label: 'Stays', icon: Home },
]

const MOBILE_CTA_COPY: Record<Tab, string> = {
  trips: 'Explore Trips',
  stays: 'Find Stays',
  activities: 'Explore Activities',
  rentals: 'Find Rentals',
}

function joinDesktopHeadline(copy: WanderHeroCopy) {
  return `${copy.line2Before}${copy.line2Accent}${copy.line2After}`.trim()
}

function resolveMobileHeroTab(copy: WanderHeroCopy, tab: Tab): WanderHeroMobileTabCopy {
  if (copy.mobileContentMode === 'custom') return copy.mobileTabs[tab]
  if (tab === 'trips') {
    return {
      eyebrow: copy.mobileTabs.trips.eyebrow,
      title: copy.line1,
      subtitle: copy.subtitle,
    }
  }
  return copy.mobileTabs[tab]
}

function todayLocalIsoDate() {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthParamFromRange(start: string, end: string): string | undefined {
  if (!start?.trim() || !end?.trim()) return undefined
  const d1 = new Date(start)
  const d2 = new Date(end)
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return undefined
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return String(d1.getMonth())
  }
  return undefined
}

function maxIsoDate(a: string, b: string) {
  return a >= b ? a : b
}

export function WanderMobileHeroSearch({
  initialTab = 'trips',
  heroImageUrl,
  heroCopy,
  stats,
  userProfile,
  listedActivities,
  wanderSearchBasePath = '/',
}: {
  initialTab?: Tab
  heroImageUrl: string
  heroCopy: WanderHeroCopy
  stats: Pick<WanderStats, 'destinations' | 'bookings' | 'happyPercent'>
  userProfile?: {
    id: string
    username: string
    full_name: string | null
    avatar_url: string | null
    is_host?: boolean
    role?: string | null
  } | null
  listedActivities: string[]
  wanderSearchBasePath?: '/'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isExplorePending, startExploreTransition] = useTransition()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [today, setToday] = useState<string | null>(null)
  const [tripWhere, setTripWhere] = useState('')
  const [tripStart, setTripStart] = useState('')
  const [tripEnd, setTripEnd] = useState('')
  const [stayWhere, setStayWhere] = useState('')
  const [stayIn, setStayIn] = useState('')
  const [stayOut, setStayOut] = useState('')
  const [stayGuests, setStayGuests] = useState('2')
  const [actWhere, setActWhere] = useState('')
  const [actStart, setActStart] = useState('')
  const [actEnd, setActEnd] = useState('')
  const [actType, setActType] = useState('')
  const [rentWhere, setRentWhere] = useState('')
  const [rentItem, setRentItem] = useState('')

  useEffect(() => {
    const t = todayLocalIsoDate()
    setToday(t)
    setTripStart(s => s || t)
    setStayIn(s => s || t)
    setActStart(s => s || t)
  }, [])

  useEffect(() => {
    const urlTab = searchParams.get('tab')
    if (urlTab === 'trips' || urlTab === 'stays' || urlTab === 'activities' || urlTab === 'rentals') {
      setTab(urlTab)
    }
  }, [searchParams])

  const setBrowseTab = useCallback((nextTab: Tab) => {
    setTab(nextTab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', nextTab)
    const hasActiveExploreFilters = Boolean(params.get('q')?.trim() || params.get('month')?.trim())
    if (hasActiveExploreFilters) params.set('search', '1')
    else params.delete('search')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const buildExploreHref = useCallback((): string => {
    const params = new URLSearchParams()
    params.set('tab', tab)

    if (tab === 'trips') {
      if (tripWhere.trim()) params.set('q', tripWhere.trim())
      const m = monthParamFromRange(tripStart, tripEnd)
      if (m !== undefined) params.set('month', m)
    } else if (tab === 'stays') {
      if (stayWhere.trim()) params.set('q', stayWhere.trim())
    } else if (tab === 'activities') {
      const parts = [actWhere.trim(), actType.trim()].filter(Boolean)
      if (parts.length) params.set('q', parts.join(' '))
      const m = monthParamFromRange(actStart, actEnd)
      if (m !== undefined) params.set('month', m)
    } else if (tab === 'rentals') {
      const qParts = [rentWhere.trim(), rentItem.trim()].filter(Boolean)
      if (qParts.length) params.set('q', qParts.join(' '))
    }

    params.set('search', '1')
    return `${wanderSearchBasePath}?${params.toString()}#wander-explore`
  }, [actEnd, actStart, actType, rentItem, rentWhere, stayWhere, tab, tripEnd, tripStart, tripWhere, wanderSearchBasePath])

  function goExplore() {
    const href = buildExploreHref()
    startExploreTransition(() => {
      pushExploreUrl(router, wanderSearchBasePath, href)
      setSheetOpen(false)
    })
  }

  const summaryLines = useMemo(() => {
    if (tab === 'trips') {
      return [
        tripWhere.trim() || 'Pick a destination',
        tripStart && tripEnd ? `${tripStart} to ${tripEnd}` : tripStart || 'Choose travel month or dates',
      ]
    }
    if (tab === 'stays') {
      return [
        stayWhere.trim() || 'Pick a stay area',
        stayIn && stayOut ? `${stayIn} to ${stayOut} · ${stayGuests} guests` : `${stayGuests} guests`,
      ]
    }
    if (tab === 'activities') {
      return [
        [actWhere.trim(), actType.trim()].filter(Boolean).join(' · ') || 'Choose a place and activity',
        actStart && actEnd ? `${actStart} to ${actEnd}` : actStart || 'Pick a date',
      ]
    }
    return [
      [rentWhere.trim(), rentItem.trim()].filter(Boolean).join(' · ') || 'Choose an area and rental',
      'Best for local transport and gear planning',
    ]
  }, [actEnd, actStart, actType, rentItem, rentWhere, stayGuests, stayIn, stayOut, stayWhere, tab, tripEnd, tripStart, tripWhere])

  const hero = resolveMobileHeroTab(heroCopy, tab)
  const activityOptions = [{ label: 'All activities', value: '' } as const, ...listedActivities.map(a => ({ label: a, value: a }))]
  const instagramHref = heroCopy.mobileContentMode === 'custom' ? heroCopy.mobileInstagramUrl : heroCopy.instagramUrl
  const instagramLabel = heroCopy.mobileContentMode === 'custom' ? heroCopy.mobileInstagramLabel : heroCopy.instagramLabel
  const statsInline = [
    { icon: MapPin, value: `${stats.destinations}+`, label: 'Destinations' },
    { icon: CreditCard, value: `${stats.bookings}+`, label: 'Bookings' },
    { icon: Smile, value: `${stats.happyPercent}%`, label: 'Happy users' },
  ] as const
  const heroTypography = heroCopy.mobileFontMode === 'custom' ? heroCopy.mobileTypography : heroCopy.desktopTypography
  const eyebrowStyle: CSSProperties | undefined = heroTypography.badgeSize ? { fontSize: heroTypography.badgeSize } : undefined
  const titleStyle: CSSProperties | undefined = heroTypography.headlineSize ? { fontSize: heroTypography.headlineSize } : undefined
  const subtitleStyle: CSSProperties | undefined = heroTypography.subtitleSize ? { fontSize: heroTypography.subtitleSize } : undefined
  const instagramStyle: CSSProperties | undefined = heroTypography.instagramSize ? { fontSize: heroTypography.instagramSize } : undefined
  const statsStyle: CSSProperties | undefined = heroTypography.statsSize ? { fontSize: heroTypography.statsSize } : undefined
  const desktopLine2 = joinDesktopHeadline(heroCopy)
  const showDesktopLine2 = heroCopy.mobileContentMode === 'inherit' && tab === 'trips' && desktopLine2.length > 0

  return (
    <div className="md:hidden">
      <section className="relative overflow-hidden border-b border-white/10 bg-background">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImageUrl} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,12,20,0.18),rgba(6,12,20,0.84)_52%,rgba(6,12,20,0.98)_100%)]" />
        </div>
        <div className="relative z-[1] px-4 pb-4 pt-4">
          {/* Top row: eyebrow chip on the left, notifications + avatar on the right */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary" style={eyebrowStyle}>
              {hero.eyebrow}
            </div>
            <div className="flex items-center gap-2">
              {userProfile ? <NotificationBell userId={userProfile.id} wanderNav /> : null}
              {userProfile ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/45 rounded-full">
                    <Avatar className="h-9 w-9 border-2 border-white/20">
                      <AvatarImage src={userProfile.avatar_url || ''} alt={userProfile.full_name || userProfile.username} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {getInitials(userProfile.full_name || userProfile.username)}
                      </AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[200] glass-modal w-60 rounded-xl p-0 text-white shadow-lg ring-0 min-w-[15rem]">
                    <div className="px-4 py-3">
                      <p className="text-base font-semibold truncate">{userProfile.full_name || userProfile.username}</p>
                      <p className="text-sm text-white/65">@{userProfile.username}</p>
                    </div>
                    <DropdownMenuSeparator className="bg-white/15" />
                    <DropdownMenuItem
                      className="py-2.5 text-sm text-white/95 focus:bg-white/10 focus:text-white"
                      onClick={() => router.push(`/profile/${userProfile.username}`)}
                    >
                      <User className="mr-3 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2.5 text-sm text-white/95 focus:bg-white/10 focus:text-white"
                      onClick={() => router.push('/profile')}
                    >
                      <Pencil className="mr-3 h-4 w-4" /> Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2.5 text-sm text-white/95 focus:bg-white/10 focus:text-white"
                      onClick={() => router.push('/bookings')}
                    >
                      <BookOpen className="mr-3 h-4 w-4" /> My Bookings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2.5 text-sm text-white/95 focus:bg-white/10 focus:text-white"
                      onClick={() => router.push('/referrals')}
                    >
                      <Gift className="mr-3 h-4 w-4 text-primary" /> Refer & Earn
                    </DropdownMenuItem>
                    {userProfile.role && userProfile.role !== 'user' && (
                      <DropdownMenuItem
                        className="py-2.5 text-sm text-white/95 focus:bg-white/10 focus:text-white"
                        onClick={() => router.push('/admin')}
                      >
                        <Shield className="mr-3 h-4 w-4 text-red-400" /> Admin Panel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-white/15" />
                    <DropdownMenuItem
                      className="py-2.5 text-sm text-destructive focus:bg-red-500/15 focus:text-red-300"
                      onClick={() => signOut()}
                    >
                      <LogOut className="mr-3 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link
                  href={`/login?redirectTo=${encodeURIComponent(`${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`)}`}
                  className="rounded-full border border-white/14 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>

          <h1 className="mt-3 text-[1.6rem] font-black leading-[1.05] tracking-tight text-white" style={titleStyle}>
            {hero.title}
            {showDesktopLine2 ? (
              <>
                <br />
                {heroCopy.line2Before}
                <span className="text-primary">{heroCopy.line2Accent}</span>
                {heroCopy.line2After}
              </>
            ) : null}
          </h1>
          <p className="mt-2 max-w-[22rem] text-[13px] leading-relaxed text-white/78" style={subtitleStyle}>
            {hero.subtitle}
          </p>

          {/* Stats row — icons + big numbers, with Instagram pinned at the right end */}
          <div className="mt-4 flex items-stretch gap-2 rounded-2xl border border-white/14 bg-black/25 p-2.5 backdrop-blur-md">
            {statsInline.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.85} aria-hidden />
                <div className="min-w-0">
                  <p className="text-base font-black tabular-nums leading-none text-white" style={statsStyle}>
                    {value}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-white/65">{label}</p>
                </div>
              </div>
            ))}
            {instagramHref ? (
              instagramHref.startsWith('/') ? (
                <Link
                  href={instagramHref}
                  aria-label={instagramLabel || 'Instagram'}
                  className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f472b6] via-[#a855f7] to-[#f59e0b] text-white shadow-md transition-transform hover:-translate-y-0.5"
                >
                  <Instagram className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </Link>
              ) : (
                <a
                  href={instagramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={instagramLabel || 'Instagram'}
                  className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f472b6] via-[#a855f7] to-[#f59e0b] text-white shadow-md transition-transform hover:-translate-y-0.5"
                >
                  <Instagram className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </a>
              )
            ) : null}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/92 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBrowseTab(id)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-colors',
                // Active state = colour change only (yellow). No filled background pill,
                // no fill on the icon stroke — preserves each icon's wireframe identity
                // (e.g. Compass, Key) which previously got crushed when filled.
                tab === id ? 'text-primary' : 'text-white/75 hover:text-white',
              )}
            >
              <Icon className="h-5 w-5 shrink-0 stroke-[2]" />
              <span className="text-[11px] font-semibold leading-tight tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="w-full rounded-[1.7rem] border border-white/12 bg-white/[0.06] px-4 py-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur-[42px] backdrop-saturate-150"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">
                {MOBILE_CTA_COPY[tab]}
              </p>
              <p className="mt-1 truncate text-base font-bold text-white">{summaryLines[0]}</p>
              <p className="mt-1 text-sm text-white/62">{summaryLines[1]}</p>
            </div>
            <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </button>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/70">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isExplorePending) setSheetOpen(false)
            }}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border-t border-white/10 bg-zinc-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_60px_rgba(0,0,0,0.36)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90" style={eyebrowStyle}>{hero.eyebrow}</p>
              <h2 className="mt-1 text-lg font-black text-white">{MOBILE_CTA_COPY[tab]}</h2>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {tab === 'trips' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Destination</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-white/45" />
                      <WanderNominatimLocationInput className="bg-white/5 pl-9 text-white" placeholder="Where are you planning?" value={tripWhere} onValueChange={setTripWhere} wander />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">From</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                      <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={tripStart} min={today ?? undefined} max={tripEnd || undefined} onChange={e => setTripStart(e.target.value)} suppressHydrationWarning />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">To</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                      <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={tripEnd} min={today ? (tripStart ? maxIsoDate(tripStart, today) : today) : tripStart || undefined} onChange={e => setTripEnd(e.target.value)} suppressHydrationWarning />
                    </div>
                  </label>
                </div>
              ) : null}

              {tab === 'stays' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Where are you staying?</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-white/45" />
                      <WanderNominatimLocationInput className="bg-white/5 pl-9 text-white" placeholder="City, neighbourhood, or area" value={stayWhere} onValueChange={setStayWhere} wander />
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Check-in</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                        <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={stayIn} min={today ?? undefined} max={stayOut || undefined} onChange={e => setStayIn(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Check-out</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                        <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={stayOut} min={today ? (stayIn ? maxIsoDate(stayIn, today) : today) : stayIn || undefined} onChange={e => setStayOut(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Guests</span>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                      <Input className="border-white/12 bg-white/5 pl-9 text-white" type="number" min={1} value={stayGuests} onChange={e => setStayGuests(e.target.value)} />
                    </div>
                  </label>
                </div>
              ) : null}

              {tab === 'activities' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Place</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-white/45" />
                      <WanderNominatimLocationInput className="bg-white/5 pl-9 text-white" placeholder="City or area" value={actWhere} onValueChange={setActWhere} wander />
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">From</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                        <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={actStart} min={today ?? undefined} max={actEnd || undefined} onChange={e => setActStart(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">To</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                        <Input className="border-white/12 bg-white/5 pl-9 text-white" type="date" value={actEnd} min={today ? (actStart ? maxIsoDate(actStart, today) : today) : actStart || undefined} onChange={e => setActEnd(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Activity type</span>
                    <select className="flex h-10 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white shadow-sm" value={actType} onChange={e => setActType(e.target.value)}>
                      {activityOptions.map((o, i) => (
                        <option key={`${o.value}-${i}`} value={o.value} className="bg-zinc-950 text-white">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {tab === 'rentals' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">Pickup area</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-white/45" />
                      <WanderNominatimLocationInput className="bg-white/5 pl-9 text-white" placeholder="City or area" value={rentWhere} onValueChange={setRentWhere} wander />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">What do you need?</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                      <Input className="border-white/12 bg-white/5 pl-9 text-white" placeholder="e.g. bike, car, tent" value={rentItem} onChange={e => setRentItem(e.target.value)} />
                    </div>
                  </label>
                </div>
              ) : null}
            </div>

            <Button type="button" onClick={goExplore} disabled={isExplorePending} className="mt-4 w-full rounded-2xl bg-primary py-6 text-base font-bold text-primary-foreground hover:bg-primary/90">
              {isExplorePending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                MOBILE_CTA_COPY[tab]
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
