'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, CalendarDays, Users, Plane, Home, Compass, Key, Search } from 'lucide-react'
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

export function WanderSearchBar({
  className = '',
  listedActivities = [],
}: {
  className?: string
  /** From live activity listings (tags + categories); first option is always “all”. */
  listedActivities: string[]
}) {
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
      if (rentWhere.trim()) params.set('q', rentWhere.trim())
    }

    router.push(`/explore?${params.toString()}`)
  }

  const activitySelectOptions = [{ label: 'All activities', value: '' } as const, ...listedActivities.map(a => ({ label: a, value: a }))]

  return (
    <div
      className={cn(
        'w-full max-w-[min(100%,52.8rem)] rounded-2xl border border-border/80 bg-card/90 p-3 sm:p-4 shadow-xl backdrop-blur-md',
        className,
      )}
    >
      <div className="flex flex-wrap justify-start gap-2 border-b border-border/60 pb-3 mb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              tab === id
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
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
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
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Date — Range</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input className="pl-9 bg-background/80" type="date" value={tripStart} onChange={e => setTripStart(e.target.value)} />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide invisible max-md:hidden">To</span>
            <Input className="bg-background/80" type="date" value={tripEnd} onChange={e => setTripEnd(e.target.value)} />
          </label>
          <Button type="button" className="font-bold bg-primary text-primary-foreground hover:bg-primary/90" onClick={goExplore}>
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </div>
      )}

      {tab === 'stays' && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] md:items-end">
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
              <Input className="pl-9 bg-background/80" type="date" value={stayIn} onChange={e => setStayIn(e.target.value)} />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Check-out</span>
            <Input className="bg-background/80" type="date" value={stayOut} onChange={e => setStayOut(e.target.value)} />
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
          <Button type="button" className="font-bold bg-primary text-primary-foreground" onClick={goExplore}>
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </div>
      )}

      {tab === 'activities' && (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.1fr_auto] md:items-end">
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
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Date — Range</span>
            <Input className="bg-background/80" type="date" value={actStart} onChange={e => setActStart(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide max-md:hidden">&nbsp;</span>
            <Input className="bg-background/80" type="date" value={actEnd} onChange={e => setActEnd(e.target.value)} />
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
          <Button type="button" className="font-bold bg-primary text-primary-foreground" onClick={goExplore}>
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </div>
      )}

      {tab === 'rentals' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 bg-background/80"
                placeholder="Where are you going?"
                value={rentWhere}
                onChange={e => setRentWhere(e.target.value)}
              />
            </div>
          </label>
          <Button type="button" className="font-bold bg-primary text-primary-foreground sm:shrink-0" onClick={goExplore}>
            <Search className="h-4 w-4 mr-2" />
            Explore
          </Button>
        </div>
      )}
    </div>
  )
}
