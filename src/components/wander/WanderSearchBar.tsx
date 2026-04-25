'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MapPin, CalendarDays, Users, Plane, Home, Compass, Key, Search, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { reverseGeocodeToSearchLabel } from '@/lib/wander/reverseGeocodeClient'

type Tab = 'trips' | 'stays' | 'activities' | 'rentals'

const TABS: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'stays', label: 'Stays', icon: Home },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'rentals', label: 'Rentals', icon: Key },
]

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

const WANDER_GEO_DONE = 'wander:geo-prompt-finished'
const WANDER_GEO_CACHE = 'wander:geo-nearby-label'

/** Local calendar YYYY-MM-DD (never UTC — avoids “yesterday” vs server TZ). */
function todayLocalIsoDate() {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function geolocationPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (p.state === 'granted' || p.state === 'denied' || p.state === 'prompt') return p.state
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function maxIsoDate(a: string, b: string) {
  return a >= b ? a : b
}

export function WanderSearchBar({
  className = '',
  listedActivities = [],
  variant = 'default',
}: {
  className?: string
  /** From live activity listings (tags + categories); first option is always “all”. */
  listedActivities: string[]
  /** High-contrast tabs on /wander (green page) */
  variant?: 'default' | 'wander'
}) {
  const isWander = variant === 'wander'
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('trips')

  const [calendarDay, setCalendarDay] = useState<string | null>(null)

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

  const [geoOpen, setGeoOpen] = useState(false)
  const [geoTarget, setGeoTarget] = useState<'stay' | 'act' | 'rent' | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  /** So we can portal to document.body (avoids hero z-stacking: belowHero paints above search) */
  const [geoPortalReady, setGeoPortalReady] = useState(false)

  const today = calendarDay

  useLayoutEffect(() => {
    const t = todayLocalIsoDate()
    setCalendarDay(t)
    setTripStart(s => s || t)
    setStayIn(s => s || t)
    setActStart(s => s || t)
  }, [])

  useEffect(() => {
    setGeoPortalReady(true)
  }, [])

  const markGeoDone = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(WANDER_GEO_DONE, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const readSessionGeoLabel = useCallback((): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return sessionStorage.getItem(WANDER_GEO_CACHE) || null
    } catch {
      return null
    }
  }, [])

  const storeSessionGeoLabel = useCallback((label: string) => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(WANDER_GEO_CACHE, label)
    } catch {
      /* ignore */
    }
  }, [])

  const applyGeoLabel = useCallback((key: 'stay' | 'act' | 'rent', label: string) => {
    const t = label.trim()
    if (!t) return
    if (key === 'stay') setStayWhere(t)
    else if (key === 'act') setActWhere(t)
    else setRentWhere(t)
  }, [])

  const fillLocationFromDevice = useCallback(
    async (key: 'stay' | 'act' | 'rent') => {
      const cached = readSessionGeoLabel()
      if (cached?.trim()) {
        applyGeoLabel(key, cached)
        return
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        toast.error('Location is not available in this browser')
        throw new Error('no geolocation')
      }
      return new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async pos => {
            try {
              const label = await reverseGeocodeToSearchLabel(pos.coords.latitude, pos.coords.longitude)
              if (label) {
                storeSessionGeoLabel(label)
                applyGeoLabel(key, label)
                resolve()
              } else {
                toast.error('Could not resolve a place name for your location')
                reject(new Error('no label'))
              }
            } catch {
              toast.error('Could not look up that location')
              reject(new Error('reverse geocode failed'))
            }
          },
          err => {
            if (err.code === err.PERMISSION_DENIED) {
              toast.error('Location permission denied')
            } else {
              toast.error('Could not get your current position')
            }
            reject(err)
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
        )
      })
    },
    [applyGeoLabel, readSessionGeoLabel, storeSessionGeoLabel],
  )

  const onLocationFieldFocus = useCallback(
    (key: 'stay' | 'act' | 'rent') => {
      void (async () => {
        const current = key === 'stay' ? stayWhere : key === 'act' ? actWhere : rentWhere
        if (current.trim()) return

        const fromSession = readSessionGeoLabel()
        if (fromSession?.trim()) {
          applyGeoLabel(key, fromSession)
          return
        }

        let done = false
        try {
          done = localStorage.getItem(WANDER_GEO_DONE) === '1'
        } catch {
          /* ignore */
        }

        const perm = await geolocationPermissionState()

        if (done) {
          if (perm === 'granted') void fillLocationFromDevice(key)
          return
        }

        if (perm === 'granted') {
          markGeoDone()
          try {
            await fillLocationFromDevice(key)
          } catch {
            /* toast already */
          }
          return
        }
        if (perm === 'denied') {
          markGeoDone()
          return
        }

        setGeoTarget(key)
        setGeoOpen(true)
      })()
    },
    [actWhere, applyGeoLabel, fillLocationFromDevice, markGeoDone, readSessionGeoLabel, rentWhere, stayWhere],
  )

  const closeGeo = useCallback(() => {
    setGeoOpen(false)
    setGeoTarget(null)
    setGeoLoading(false)
  }, [])

  const onGeoNotNow = useCallback(() => {
    markGeoDone()
    closeGeo()
  }, [closeGeo, markGeoDone])

  const onGeoAllow = useCallback(() => {
    if (!geoTarget) return
    setGeoLoading(true)
    const key = geoTarget
    void (async () => {
      try {
        await fillLocationFromDevice(key)
        markGeoDone()
        closeGeo()
      } catch {
        /* toasts in fill */
      } finally {
        setGeoLoading(false)
      }
    })()
  }, [closeGeo, fillLocationFromDevice, geoTarget, markGeoDone])

  function goExplore() {
    const params = new URLSearchParams()
    params.set('tab', tab)

    if (tab === 'trips') {
      if (tripWhere.trim()) params.set('q', tripWhere.trim())
      const m = monthParamFromRange(tripStart, tripEnd)
      if (m !== undefined) params.set('month', m)
    } else if (tab === 'stays') {
      if (stayWhere.trim()) params.set('q', stayWhere.trim())
      // Visual check-in/out/guests match the mockup; explore uses `q` for text search today.
      void stayIn
      void stayOut
      void stayGuests
    } else if (tab === 'activities') {
      const parts = [actWhere.trim(), actType.trim()].filter(Boolean)
      if (parts.length) params.set('q', parts.join(' '))
      const m = monthParamFromRange(actStart, actEnd)
      if (m !== undefined) params.set('month', m)
    } else if (tab === 'rentals') {
      const qParts = [rentWhere.trim(), rentItem.trim()].filter(Boolean)
      if (qParts.length) params.set('q', qParts.join(' '))
    }

    router.push(`/explore?${params.toString()}`)
  }

  const activitySelectOptions = [{ label: 'All activities', value: '' } as const, ...listedActivities.map(a => ({ label: a, value: a }))]

  return (
    <div
      className={cn(
        'w-full max-w-[min(100%,52.8rem)]',
        isWander
          ? 'wander-frost-panel [&_label_span]:text-white/70 [&_input]:border-white/20 [&_input]:bg-black/20 [&_input]:text-white [&_input]:placeholder:text-white/40 [&_select]:border-white/20 [&_select]:bg-black/20 [&_select]:text-white [&_svg.text-muted-foreground]:text-white/50'
          : 'rounded-2xl border border-border/80 bg-card/90 p-3 shadow-xl backdrop-blur-md sm:p-4',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-wrap justify-start gap-2 border-b pb-3 mb-3',
          isWander ? 'border-white/15' : 'border-border/60',
        )}
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              isWander
                ? tab === id
                  ? 'bg-[#fcba03] text-[oklch(0.18_0.04_155)] shadow-md'
                  : 'bg-white/5 text-white/90 hover:bg-white/10 hover:text-white'
                : tab === id
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'trips' && (
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
          onSubmit={e => {
            e.preventDefault()
            goExplore()
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="Where are you planning"
                value={tripWhere}
                onChange={e => setTripWhere(e.target.value)}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">From</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={tripStart}
                min={today ?? undefined}
                max={tripEnd || undefined}
                onChange={e => setTripStart(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">To</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={tripEnd}
                min={today ? (tripStart ? maxIsoDate(tripStart, today) : today) : tripStart || undefined}
                onChange={e => setTripEnd(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <Button type="submit" className="font-bold bg-primary text-primary-foreground hover:bg-primary/90">
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </form>
      )}

      {tab === 'stays' && (
        <form
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] md:items-end"
          onSubmit={e => {
            e.preventDefault()
            goExplore()
          }}
        >
          <label className="block space-y-1.5 md:col-span-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="Where are you going?"
                value={stayWhere}
                onChange={e => setStayWhere(e.target.value)}
                onFocus={() => onLocationFieldFocus('stay')}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Check-in</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={stayIn}
                min={today ?? undefined}
                max={stayOut || undefined}
                onChange={e => setStayIn(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Check-out</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={stayOut}
                min={today ? (stayIn ? maxIsoDate(stayIn, today) : today) : stayIn || undefined}
                onChange={e => setStayOut(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Guests</span>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                type="number"
                min={1}
                value={stayGuests}
                onChange={e => setStayGuests(e.target.value)}
              />
            </div>
          </label>
          <Button type="submit" className="font-bold bg-primary text-primary-foreground">
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </form>
      )}

      {tab === 'activities' && (
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.1fr_auto] md:items-end"
          onSubmit={e => {
            e.preventDefault()
            goExplore()
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Where?</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="City or area"
                value={actWhere}
                onChange={e => setActWhere(e.target.value)}
                onFocus={() => onLocationFieldFocus('act')}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">From</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={actStart}
                min={today ?? undefined}
                max={actEnd || undefined}
                onChange={e => setActStart(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">To</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 bg-background/80"
                type="date"
                value={actEnd}
                min={today ? (actStart ? maxIsoDate(actStart, today) : today) : actStart || undefined}
                onChange={e => setActEnd(e.target.value)}
                suppressHydrationWarning
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Activity</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background/80 px-3 py-1 text-sm shadow-sm"
              value={actType}
              onChange={e => setActType(e.target.value)}
            >
              {activitySelectOptions.map((o, i) => (
                <option key={`${o.value}-${i}`} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="font-bold bg-primary text-primary-foreground">
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </form>
      )}

      {tab === 'rentals' && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={e => {
            e.preventDefault()
            goExplore()
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="City or area"
                value={rentWhere}
                onChange={e => setRentWhere(e.target.value)}
                onFocus={() => onLocationFieldFocus('rent')}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Item</span>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="e.g. car, bike, tent"
                value={rentItem}
                onChange={e => setRentItem(e.target.value)}
              />
            </div>
          </label>
          <Button type="submit" className="font-bold bg-primary text-primary-foreground sm:shrink-0">
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </form>
      )}

      {geoPortalReady && geoOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70 p-4 sm:items-center"
              onClick={() => {
                if (!geoLoading) onGeoNotNow()
              }}
              role="presentation"
            >
              <div
                className={cn(
                  'w-full max-w-md rounded-2xl border p-4 shadow-2xl',
                  isWander
                    ? 'border-white/20 bg-zinc-950/95 text-white [color-scheme:dark]'
                    : 'border-border bg-card text-foreground',
                )}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="Search near your current location"
                aria-modal="true"
              >
                <p className="text-sm font-bold mb-1">Search near you?</p>
                <p
                  className={cn('text-xs mb-4 leading-relaxed', isWander ? 'text-white/70' : 'text-muted-foreground')}
                >
                  We can use your device location to fill this field with your area, like maps and food apps. Your
                  browser will ask for permission. Trips are left manual so you can plan ahead anywhere.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={isWander ? 'text-white/80' : undefined}
                    disabled={geoLoading}
                    onClick={onGeoNotNow}
                  >
                    Not now
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="font-bold bg-primary text-primary-foreground"
                    disabled={geoLoading}
                    onClick={e => {
                      e.preventDefault()
                      onGeoAllow()
                    }}
                  >
                    {geoLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Locating
                      </>
                    ) : (
                      'Use my location'
                    )}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
