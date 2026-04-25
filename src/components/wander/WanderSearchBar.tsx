'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CalendarDays, Users, Plane, Home, Compass, Key, Search, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

/** Local calendar date (YYYY-MM-DD) for `min` on date inputs. */
function todayLocalIsoDate() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toLocaleDateString('en-CA')
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

  const today = todayLocalIsoDate()

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
                min={today}
                max={tripEnd || undefined}
                onChange={e => setTripStart(e.target.value)}
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
                min={maxIsoDate(tripStart, today)}
                onChange={e => setTripEnd(e.target.value)}
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
                min={today}
                max={stayOut || undefined}
                onChange={e => setStayIn(e.target.value)}
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
                min={maxIsoDate(stayIn, today)}
                onChange={e => setStayOut(e.target.value)}
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
                min={today}
                max={actEnd || undefined}
                onChange={e => setActStart(e.target.value)}
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
                min={maxIsoDate(actStart, today)}
                onChange={e => setActEnd(e.target.value)}
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
    </div>
  )
}
