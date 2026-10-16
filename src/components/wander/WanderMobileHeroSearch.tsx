'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Instagram, Loader2, MapPin, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WanderHeroCopy, WanderHeroMobileTabCopy } from '@/lib/wander/wanderQueries'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'
import { isOptimizableImageUrl } from '@/lib/images/isOptimizableImageUrl'
import { WanderNominatimLocationInput } from '@/components/wander/WanderNominatimLocationInput'

type Tab = 'trips' | 'stays' | 'activities' | 'rentals'

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

const subscribeToLocalDate = () => () => {}
const getServerLocalDateSnapshot = () => null

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
  initialTab = null,
  heroImageUrl,
  heroCopy,
  statsSlot,
  accountSlot,
  listedActivities,
  wanderSearchBasePath = '/',
  onCardState,
}: {
  /**
   * `null` = first landing, no category chosen yet — all tabs are visually
   * inactive and the search card stays hidden until the user picks one. When
   * the URL has `?tab=trips` etc. the corresponding tab opens highlighted.
   */
  initialTab?: Tab | null
  heroImageUrl: string
  heroCopy: WanderHeroCopy
  statsSlot: ReactNode
  accountSlot: ReactNode
  listedActivities: string[]
  wanderSearchBasePath?: '/'
  onCardState?: (state: { tab: Tab; summaryLines: [string, string]; openSheet: () => void } | null) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isExplorePending, startExploreTransition] = useTransition()
  const urlTab = searchParams.get('tab')
  const tab: Tab | null = urlTab === 'trips' || urlTab === 'stays' || urlTab === 'activities' || urlTab === 'rentals'
    ? urlTab
    : initialTab ?? null
  const [sheetOpen, setSheetOpen] = useState(false)
  const openSheet = useCallback(() => setSheetOpen(true), [])

  const today = useSyncExternalStore(subscribeToLocalDate, todayLocalIsoDate, getServerLocalDateSnapshot)
  const [tripWhere, setTripWhere] = useState('')
  const [tripStartInput, setTripStartInput] = useState<string | null>(null)
  const [tripEnd, setTripEnd] = useState('')
  const [stayWhere, setStayWhere] = useState('')
  const [stayInInput, setStayInInput] = useState<string | null>(null)
  const [stayOut, setStayOut] = useState('')
  const [stayGuests, setStayGuests] = useState('2')
  const [actWhere, setActWhere] = useState('')
  const [actStartInput, setActStartInput] = useState<string | null>(null)
  const [actEnd, setActEnd] = useState('')
  const [actType, setActType] = useState('')
  const [rentWhere, setRentWhere] = useState('')
  const [rentItem, setRentItem] = useState('')

  const tripStart = tripStartInput ?? today ?? ''
  const stayIn = stayInInput ?? today ?? ''
  const actStart = actStartInput ?? today ?? ''

  const buildExploreHref = useCallback((): string => {
    if (!tab) return wanderSearchBasePath
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
  }, [actEnd, actStart, actType, actWhere, rentItem, rentWhere, stayWhere, tab, tripEnd, tripStart, tripWhere, wanderSearchBasePath])

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
  }, [actEnd, actStart, actType, actWhere, rentItem, rentWhere, stayGuests, stayIn, stayOut, stayWhere, tab, tripEnd, tripStart, tripWhere])

  useEffect(() => {
    if (!onCardState) return
    if (tab) {
      onCardState({ tab, summaryLines: summaryLines as [string, string], openSheet })
    } else {
      onCardState(null)
    }
  }, [tab, summaryLines, openSheet, onCardState])

  const hero = resolveMobileHeroTab(heroCopy, tab ?? 'trips')
  const activityOptions = [{ label: 'All activities', value: '' } as const, ...listedActivities.map(a => ({ label: a, value: a }))]
  const instagramHref = heroCopy.mobileContentMode === 'custom' ? heroCopy.mobileInstagramUrl : heroCopy.instagramUrl
  const instagramLabel = heroCopy.mobileContentMode === 'custom' ? heroCopy.mobileInstagramLabel : heroCopy.instagramLabel
  const heroTypography = heroCopy.mobileFontMode === 'custom' ? heroCopy.mobileTypography : heroCopy.desktopTypography
  const eyebrowStyle: CSSProperties | undefined = heroTypography.badgeSize ? { fontSize: heroTypography.badgeSize } : undefined
  const titleStyle: CSSProperties | undefined = heroTypography.headlineSize ? { fontSize: heroTypography.headlineSize } : undefined
  const subtitleStyle: CSSProperties | undefined = heroTypography.subtitleSize ? { fontSize: heroTypography.subtitleSize } : undefined
  const desktopLine2 = joinDesktopHeadline(heroCopy)
  const showDesktopLine2 = heroCopy.mobileContentMode === 'inherit' && tab === 'trips' && desktopLine2.length > 0

  return (
    <div className="md:hidden">
      <section className="relative overflow-hidden border-b border-foreground/10 bg-background text-foreground">
        <div className="absolute inset-0">
          <Image
            src={heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            unoptimized={!isOptimizableImageUrl(heroImageUrl)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_40%,transparent)_0%,color-mix(in_oklab,var(--background)_82%,transparent)_42%,var(--background)_100%)]" />
        </div>
        <div className="relative z-[1] px-4 pb-4 pt-4">
          {/* Top row: eyebrow chip on the left, notifications + avatar on the right */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary" style={eyebrowStyle}>
              {hero.eyebrow}
            </div>
            <div className="flex items-center gap-2">
              {accountSlot}
            </div>
          </div>

          {/* Headline shrinks closer to the subtitle size so the whole hero
              fits without growing taller. The tab strip below straddles the
              hero/below boundary; this trims the room it needs. */}
          <h1 className="mt-3 text-[1.25rem] font-black leading-[1.15] tracking-tight text-foreground" style={titleStyle}>
            {hero.title}
            {showDesktopLine2 ? (
              <>
                <br />
                {heroCopy.line2Before}
                <span className="brand-gold">{heroCopy.line2Accent}</span>
                {heroCopy.line2After}
              </>
            ) : null}
          </h1>
          <p className="mt-1.5 max-w-[22rem] text-[12.5px] leading-snug text-foreground/78" style={subtitleStyle}>
            {hero.subtitle}
          </p>

          {/* Frosted stats panel — saturated glass instead of flat black/25 so
              it reads like the desktop search/filter card. Extra bottom space
              below so the tab strip can land on the hero with breathing room. */}
          <div className="mt-3 mb-7 flex items-stretch gap-2 rounded-2xl border border-foreground/16 bg-foreground/[0.07] p-2.5 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            {statsSlot}
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

      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/70">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isExplorePending) setSheetOpen(false)
            }}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border-t border-foreground/10 bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_60px_rgba(0,0,0,0.36)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-foreground/15" />
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90" style={eyebrowStyle}>{hero.eyebrow}</p>
              <h2 className="mt-1 text-lg font-black text-foreground">{tab ? MOBILE_CTA_COPY[tab] : ''}</h2>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {tab === 'trips' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Destination</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <WanderNominatimLocationInput className="bg-foreground/5 pl-9 text-foreground" placeholder="Where are you planning?" value={tripWhere} onValueChange={setTripWhere} wander />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">From</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={tripStart} min={today ?? undefined} max={tripEnd || undefined} onChange={e => setTripStartInput(e.target.value)} suppressHydrationWarning />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">To</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={tripEnd} min={today ? (tripStart ? maxIsoDate(tripStart, today) : today) : tripStart || undefined} onChange={e => setTripEnd(e.target.value)} suppressHydrationWarning />
                    </div>
                  </label>
                </div>
              ) : null}

              {tab === 'stays' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Where are you staying?</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <WanderNominatimLocationInput className="bg-foreground/5 pl-9 text-foreground" placeholder="City, neighbourhood, or area" value={stayWhere} onValueChange={setStayWhere} wander />
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Check-in</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                        <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={stayIn} min={today ?? undefined} max={stayOut || undefined} onChange={e => setStayInInput(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Check-out</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                        <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={stayOut} min={today ? (stayIn ? maxIsoDate(stayIn, today) : today) : stayIn || undefined} onChange={e => setStayOut(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Guests</span>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="number" min={1} value={stayGuests} onChange={e => setStayGuests(e.target.value)} />
                    </div>
                  </label>
                </div>
              ) : null}

              {tab === 'activities' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Place</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <WanderNominatimLocationInput className="bg-foreground/5 pl-9 text-foreground" placeholder="City or area" value={actWhere} onValueChange={setActWhere} wander />
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">From</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                        <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={actStart} min={today ?? undefined} max={actEnd || undefined} onChange={e => setActStartInput(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">To</span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                        <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" type="date" value={actEnd} min={today ? (actStart ? maxIsoDate(actStart, today) : today) : actStart || undefined} onChange={e => setActEnd(e.target.value)} suppressHydrationWarning />
                      </div>
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Activity type</span>
                    <select className="flex h-10 w-full rounded-xl border border-foreground/12 bg-foreground/5 px-3 text-sm text-foreground shadow-sm" value={actType} onChange={e => setActType(e.target.value)}>
                      {activityOptions.map((o, i) => (
                        <option key={`${o.value}-${i}`} value={o.value} className="bg-card text-foreground">
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
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">Pickup area</span>
                    <div className="relative min-w-0">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <WanderNominatimLocationInput className="bg-foreground/5 pl-9 text-foreground" placeholder="City or area" value={rentWhere} onValueChange={setRentWhere} wander />
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/60">What do you need?</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                      <Input className="border-foreground/12 bg-foreground/5 pl-9 text-foreground" placeholder="e.g. bike, car, tent" value={rentItem} onChange={e => setRentItem(e.target.value)} />
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
                tab ? MOBILE_CTA_COPY[tab] : 'Explore'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
