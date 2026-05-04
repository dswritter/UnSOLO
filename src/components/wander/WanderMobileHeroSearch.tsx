'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronRight, Compass, Home, Key, Loader2, MapPin, Plane, Search, Users } from 'lucide-react'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WanderHeroCopy, WanderStats } from '@/lib/wander/wanderQueries'
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

const MOBILE_HERO_COPY: Record<Tab, { eyebrow: string; title: string; subtitle: string; cta: string }> = {
  trips: {
    eyebrow: 'Trips-first planning',
    title: 'Find your next solo journey',
    subtitle: 'Start with the trip, then layer in stays, activities, and rentals around it.',
    cta: 'Explore Trips',
  },
  stays: {
    eyebrow: 'Stay nearby',
    title: 'Book stays around your route',
    subtitle: 'Find trusted places that fit naturally into the trip you already have in mind.',
    cta: 'Find Stays',
  },
  activities: {
    eyebrow: 'Add adventure',
    title: 'Pick the best add-on activity',
    subtitle: 'Rafting, paragliding, camps, and day plans that make the trip more memorable.',
    cta: 'Explore Activities',
  },
  rentals: {
    eyebrow: 'Move smoothly',
    title: 'Get the right rental for the plan',
    subtitle: 'Cars, bikes, and gear rentals that fit the area and timing of your trip.',
    cta: 'Find Rentals',
  },
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

  const hero =
    tab === 'trips'
      ? {
          eyebrow: MOBILE_HERO_COPY.trips.eyebrow,
          title: heroCopy.line1,
          subtitle: heroCopy.subtitle,
          cta: MOBILE_HERO_COPY.trips.cta,
        }
      : MOBILE_HERO_COPY[tab]
  const activityOptions = [{ label: 'All activities', value: '' } as const, ...listedActivities.map(a => ({ label: a, value: a }))]
  const instagramHref = heroCopy.instagramUrl
  const statsInline = [
    `${stats.destinations}+ destinations`,
    `${stats.bookings}+ bookings`,
    `${stats.happyPercent}% happy`,
  ]

  return (
    <div className="md:hidden">
      <section className="relative overflow-hidden border-b border-white/10 bg-background">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImageUrl} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,12,20,0.18),rgba(6,12,20,0.84)_52%,rgba(6,12,20,0.98)_100%)]" />
        </div>
        <div className="relative z-[1] px-4 pb-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            {instagramHref ? (
              instagramHref.startsWith('/') ? (
                <Link
                  href={instagramHref}
                  className="inline-flex min-w-0 max-w-[58%] items-center gap-2 rounded-full border border-white/14 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/88 backdrop-blur-md"
                >
                  <span className="truncate">{heroCopy.instagramLabel}</span>
                </Link>
              ) : (
                <a
                  href={instagramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 max-w-[58%] items-center gap-2 rounded-full border border-white/14 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/88 backdrop-blur-md"
                >
                  <span className="truncate">{heroCopy.instagramLabel}</span>
                </a>
              )
            ) : (
              <span />
            )}

            <div className="flex items-center gap-3">
              {userProfile ? <NotificationBell userId={userProfile.id} wanderNav /> : null}
              {userProfile ? (
                <Link href={`/profile/${userProfile.username}`} className="shrink-0">
                  <Avatar className="h-9 w-9 border-2 border-white/20">
                    <AvatarImage src={userProfile.avatar_url || ''} alt={userProfile.full_name || userProfile.username} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {getInitials(userProfile.full_name || userProfile.username)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
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

          <div className="mt-5 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            {hero.eyebrow}
          </div>
          <h1 className="mt-3 max-w-[15rem] text-[1.4rem] font-black leading-[1.05] tracking-tight text-white">
            {hero.title}
          </h1>
          <p className="mt-2 max-w-[18rem] text-[13px] leading-relaxed text-white/78">
            {hero.subtitle}
          </p>
          <div className="mt-4 ml-auto flex max-w-[11.5rem] flex-col gap-1 rounded-2xl border border-white/14 bg-black/20 p-3 text-right backdrop-blur-md">
            {statsInline.map((item) => (
              <p key={item} className="text-[11px] font-semibold leading-tight text-white/92">
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/92 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBrowseTab(id)}
              className={cn(
                'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-1 py-2 text-[13px] font-semibold transition-colors',
                tab === id ? 'text-primary' : 'text-white/80 hover:text-white',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 stroke-[1.9]', tab === id && 'fill-current')} />
              <span className="truncate">{label}</span>
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
                {hero.cta}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">{hero.eyebrow}</p>
              <h2 className="mt-1 text-lg font-black text-white">{hero.cta}</h2>
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
                hero.cta
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
