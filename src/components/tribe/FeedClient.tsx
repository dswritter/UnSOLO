'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import type { Post, TripLite } from '@/lib/tribe/models'
import { PostCard, TripStub } from './PostCard'
import { dateRange } from './format'

type Kind = 'all' | 'plan' | 'story' | 'ask'
type FeedItem = Post | { kind: 'placed_trip'; trip: TripLite }
type FeedResponse = { items: FeedItem[]; nextCursor: string | null; caughtUp: boolean; nextDepartures: TripLite[] }
type Suggestion = { type: 'plan' | 'trip'; reason: string; post?: Post; trip?: TripLite }

const FILTERS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'For you' },
  { id: 'plan', label: 'Plans' },
  { id: 'story', label: 'Stories' },
  { id: 'ask', label: 'Asks' },
]

export function FeedClient({ initial, nextDepartures: initialDepartures, signedIn, demo, place }: {
  place?: string
  initial: Post[]
  nextDepartures: TripLite[]
  signedIn: boolean
  demo: boolean
}) {
  const [kind, setKind] = useState<Kind>('all')
  const [items, setItems] = useState<FeedItem[]>(initial)
  const [cursor, setCursor] = useState<string | null>(initial.length >= 20 ? 'more' : null)
  const [caughtUp, setCaughtUp] = useState(initial.length < 20)
  const [departures, setDepartures] = useState(initialDepartures)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const load = useCallback(async (k: Kind, after: string | null, near = coords) => {
    if (demo) {
      setItems(k === 'all' ? initial : initial.filter((p) => p.kind === k))
      setCaughtUp(true)
      setCursor(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams()
      if (k !== 'all') q.set('kind', k)
      if (place) q.set('place', place)
      if (after && after !== 'more') q.set('cursor', after)
      if (near) { q.set('lat', String(near.lat)); q.set('lng', String(near.lng)) }
      const r = await apiFetch<FeedResponse>(`/feed?${q}`)
      setItems((prev) => (after ? [...prev, ...r.items] : r.items))
      setCursor(r.nextCursor)
      setCaughtUp(r.caughtUp)
      if (r.nextDepartures.length) setDepartures(r.nextDepartures)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [coords, demo, initial, place])

  useEffect(() => {
    if (demo) return
    const q = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ''
    apiFetch<{ items: Suggestion[] }>(`/suggestions${q}`).then((r) => setSuggestions(r.items)).catch(() => undefined)
  }, [coords, demo])

  function choose(k: Kind) {
    setKind(k)
    void load(k, null)
  }

  /** Coarse, opt-in location — rounded to ~1 km before it leaves the browser. */
  function askLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: Math.round(p.coords.latitude * 100) / 100, lng: Math.round(p.coords.longitude * 100) / 100 }
        setCoords(c)
        void load(kind, null, c)
      },
      () => setError('Location is off. Suggestions use your home city instead.'),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 8000 },
    )
  }

  const asks = useMemo(() => items.filter((i): i is Post => i.kind === 'ask').slice(0, 3), [items])
  const plansSoon = useMemo(() => suggestions.filter((s) => s.type === 'plan').slice(0, 3), [suggestions])

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 pb-28 pt-4 md:px-6 lg:grid-cols-[220px_minmax(0,640px)_340px] lg:justify-center lg:pt-8">
      {/* Left: filters (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          <div>
            <h2 className="mb-2 text-sm text-muted-foreground">Show</h2>
            <ul className="space-y-1">
              {FILTERS.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => choose(f.id)} aria-pressed={kind === f.id}
                    className={`flex min-h-11 w-full items-center rounded-md px-3 text-left text-[15px] ${kind === f.id ? 'bg-foreground text-background font-semibold' : 'hover:bg-accent'}`}>
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={askLocation} className="pc-btn pc-btn-quiet pc-btn-block">
            <MapPin className="h-4 w-4" aria-hidden /> {coords ? 'Near you' : 'Use my location'}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">Tribe is for plans, stories and questions between travellers. Nothing here is a booking. Paid trips are marked <span className="pc-tag pc-tag-hosted">Hosted trip</span>.</p>
        </div>
      </aside>

      {/* Centre: the feed */}
      <main className="min-w-0">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] leading-none">Tribe</h1>
            <p className="mt-1 text-sm text-muted-foreground">Plans, stories and asks from travellers{demo ? ' · sample posts (local preview)' : ''}</p>
          </div>
          <Link href={signedIn ? '/tribe/new' : '/login?redirectTo=%2Ftribe%2Fnew'} className="pc-btn pc-btn-sm md:hidden"><Plus className="h-4 w-4" aria-hidden /> Post</Link>
        </div>
        {place && (
          <p className="mb-3 text-sm">Showing <strong className="capitalize">{place.replace(/-/g, ' ')}</strong> · <Link href="/tribe" className="pc-link">Show everywhere</Link></p>
        )}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide lg:hidden" role="toolbar" aria-label="Filter posts">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="pc-chip" aria-pressed={kind === f.id} onClick={() => choose(f.id)}>{f.label}</button>
          ))}
          <button type="button" className="pc-chip" aria-pressed={!!coords} onClick={askLocation}><MapPin className="h-3.5 w-3.5" aria-hidden /> Near me</button>
        </div>

        {items.length === 0 && !loading ? (
          <div className="pc-pencilled p-8 text-center">
            <h2 className="text-xl">Nothing here yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Be the first: share where you&apos;re headed, or a trip you loved.</p>
            <Link href={signedIn ? '/tribe/new' : '/login?redirectTo=%2Ftribe%2Fnew'} className="pc-btn mt-4">Create a post</Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((it, i) => (
              <li key={'id' in it ? it.id : `placed-${it.trip.id}-${i}`}>
                {it.kind === 'placed_trip'
                  ? <TripStub trip={it.trip} placed />
                  : <PostCard post={it} signedIn={signedIn} demo={demo} priority={i < 2} />}
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error} <button className="pc-link underline" onClick={() => load(kind, null)}>Retry</button></p>}
        {loading && <div className="mt-4 space-y-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="pc-skel h-56" />)}</div>}
        {!loading && cursor && !caughtUp && (
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4" onClick={() => load(kind, cursor)}>Show more</button>
        )}
        {caughtUp && items.length > 0 && (
          <section className="mt-8 border-t border-foreground pt-4" aria-label="You're caught up">
            <h2 className="text-lg">You&apos;re caught up</h2>
            <p className="text-sm text-muted-foreground">Leaving next on UnSOLO</p>
            <div className="mt-3 space-y-3">{departures.map((t) => <TripStub key={t.id} trip={t} />)}</div>
          </section>
        )}
      </main>

      {/* Right: context rail (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          <section>
            <h2 className="text-lg">Going your way</h2>
            <p className="text-xs text-muted-foreground">{coords ? 'Near you, on your dates' : 'Plans with open spots soon'}</p>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {(plansSoon.length ? plansSoon.map((s) => s.post!) : items.filter((i): i is Post => i.kind === 'plan').slice(0, 3)).map((p) => (
                <li key={p.id}>
                  <Link href={`/tribe/p/${p.id}`} className="block py-3 hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.title ?? p.place?.name}</span>
                      <span className="pc-mono shrink-0 text-xs text-muted-foreground">{Math.max((p.spotsTotal ?? 0) - p.memberCount, 0)} open</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.place?.name} · {dateRange(p.startsOn, p.endsOn)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {asks.length > 0 && (
            <section>
              <h2 className="text-lg">This week&apos;s questions</h2>
              <ul className="mt-2 space-y-2">
                {asks.map((a) => (
                  <li key={a.id}><Link href={`/tribe/p/${a.id}`} className="line-clamp-2 text-sm hover:underline">{a.body}</Link>
                    <span className="pc-mono text-xs text-muted-foreground">{a.commentCount} answers</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
