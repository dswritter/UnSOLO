'use client'

import { seatShort } from '@/lib/seats'
import { useEffect, useMemo, useState } from 'react'
import { LazyPinMap, type MapPin } from '@/components/maps/LazyPinMap'
import { v1 } from '@/lib/api/v1-client'
import { formatPrice } from '@/lib/utils'

type Category = 'all' | 'trips' | 'stays' | 'activities' | 'rentals' | 'plans'
type Media = { url: string; thumbUrl: string | null } | null
type Pin = {
  kind: 'trip' | 'stay' | 'activity' | 'rental' | 'plan'
  id: string
  slug?: string
  postId?: string
  title: string
  place: string | null
  lat: number
  lng: number
  priceFromPaise?: number | null
  unit?: string | null
  date?: string | null
  seatsLeft?: number | null
  seatsTotal?: number | null
  spotsLeft?: number | null
  spotsTotal?: number | null
  image: Media
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trips', label: 'Trips' },
  { id: 'stays', label: 'Stays' },
  { id: 'activities', label: 'Activities' },
  { id: 'rentals', label: 'Rentals' },
  { id: 'plans', label: 'Plans' },
]

const KIND: Record<Pin['kind'], { color: string; glyph: string; label: string }> = {
  trip: { color: '#0f5132', glyph: 'T', label: 'View trip' },
  stay: { color: '#7c3aed', glyph: 'S', label: 'View stay' },
  activity: { color: '#c2410c', glyph: 'A', label: 'View activity' },
  rental: { color: '#0369a1', glyph: 'R', label: 'View rental' },
  plan: { color: '#be185d', glyph: 'P', label: 'View plan' },
}
const LISTING_PATH: Record<string, string> = { stay: 'stays', activity: 'activities', rental: 'rentals' }

const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function hrefFor(p: Pin): string | null {
  if (p.kind === 'trip' && p.slug) return `/packages/${encodeURIComponent(p.slug)}`
  if (p.kind === 'plan' && p.postId) return `/tribe/p/${encodeURIComponent(p.postId)}`
  if (LISTING_PATH[p.kind] && p.slug) return `/listings/${LISTING_PATH[p.kind]}/${encodeURIComponent(p.slug)}`
  return null
}

function subtitleFor(p: Pin): string | null {
  const parts: string[] = []
  if (p.date) parts.push(shortDate(p.date))
  if (p.priceFromPaise) parts.push(`From ${formatPrice(p.priceFromPaise)}${p.unit ? ` / ${p.unit}` : ''}`)
  if (p.kind === 'trip' && p.seatsLeft != null && p.seatsTotal) parts.push(seatShort(p.seatsTotal, p.seatsLeft))
  if (p.kind === 'plan' && p.spotsLeft != null && p.spotsTotal) parts.push(seatShort(p.spotsTotal, p.spotsLeft))
  return parts.join(' · ') || null
}

/** Explore as a map: trips on their destination, listings on their spot, open plans on their place. */
export function ExploreMapView({ initialCategory = 'all' }: { initialCategory?: Category }) {
  const [category, setCategory] = useState<Category>(initialCategory)
  const [pins, setPins] = useState<Pin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    void v1<{ pins: Pin[] }>(`/explore/map?category=${category}`, { signal: ac.signal }).then((r) => {
      if (ac.signal.aborted) return
      if (r.ok) { setPins(r.data.pins); setError(null) } else { setError(r.error) }
    })
    return () => ac.abort()
  }, [category])

  const mapPins = useMemo<MapPin[]>(() => (pins ?? []).map((p) => ({
    id: `${p.kind}-${p.id}`,
    lat: p.lat,
    lng: p.lng,
    title: p.title,
    meta: p.place,
    subtitle: subtitleFor(p),
    image: p.image?.thumbUrl || p.image?.url || null,
    href: hrefFor(p),
    linkLabel: KIND[p.kind]?.label ?? 'Open',
    color: KIND[p.kind]?.color,
    glyph: KIND[p.kind]?.glyph,
  })), [pins])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show on the map">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setPins(null) }} className="pc-chip pc-chip-sm">
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <LazyPinMap pins={mapPins} fitOnChange style={{ height: 'min(70vh, 640px)' }} ariaLabel="Map of trips, stays, activities, rentals and plans" />
        {pins === null && !error ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-background/90 px-3 py-1 text-xs shadow">Loading places…</div>
        ) : null}
        {pins && pins.length === 0 ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-background/90 px-3 py-1 text-xs shadow">Nothing on the map here yet</div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
