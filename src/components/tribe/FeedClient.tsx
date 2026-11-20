'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Camera, ChartBar, MapPin, MessageCircleQuestionMark, Plus, Sparkles, UsersRound } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import type { Post, TripLite, UserLite } from '@/lib/tribe/models'
import type { ChatSummary } from '@/lib/tribe/chats'
import { cn } from '@/lib/utils'
import { Avatar, PlanCard, PostCard, TripStub } from './PostCard'
import { StoryRail } from './StoryRail'
import { ComposeSheet } from './ComposeSheet'

type Filter = 'all' | 'plan' | 'story' | 'question' | 'poll' | 'saved'
type FeedItem = Post | { kind: 'placed_trip'; trip: TripLite }
type FeedResponse = { items: FeedItem[]; nextCursor: string | null; caughtUp: boolean; nextDepartures: TripLite[] }
type Suggestion = { type: 'plan' | 'trip'; reason: string; post?: Post; trip?: TripLite }

const FILTERS: { id: Filter; label: string; icon: typeof Sparkles; chip: boolean }[] = [
  { id: 'all', label: 'For you', icon: Sparkles, chip: true },
  { id: 'plan', label: 'Plans', icon: UsersRound, chip: true },
  { id: 'story', label: 'Stories', icon: Camera, chip: true },
  { id: 'question', label: 'Questions', icon: MessageCircleQuestionMark, chip: true },
  { id: 'poll', label: 'Polls', icon: ChartBar, chip: true },
  { id: 'saved', label: 'Saved', icon: Bookmark, chip: false },
]

/** API kind for a filter; questions and polls are both asks (a poll is an ask with options). */
const apiKind = (f: Filter) => (f === 'plan' || f === 'story' ? f : f === 'question' || f === 'poll' ? 'ask' : null)
function matches(f: Filter, it: FeedItem): boolean {
  if (it.kind === 'placed_trip') return f === 'all'
  switch (f) {
    case 'all': return true
    case 'plan': return it.kind === 'plan'
    case 'story': return it.kind === 'story'
    case 'question': return it.kind === 'ask' && !it.poll
    case 'poll': return it.kind === 'ask' && !!it.poll
    case 'saved': return it.viewer.saved
  }
}
const isPost = (i: FeedItem): i is Post => i.kind !== 'placed_trip'

export function FeedClient({ initial, nextDepartures: initialDepartures, signedIn, demo, place, me }: {
  place?: string
  initial: Post[]
  nextDepartures: TripLite[]
  signedIn: boolean
  demo: boolean
  me?: UserLite | null
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<FeedItem[]>(initial)
  const [cursor, setCursor] = useState<string | null>(initial.length >= 20 ? 'more' : null)
  const [caughtUp, setCaughtUp] = useState(initial.length < 20)
  const [departures, setDepartures] = useState(initialDepartures)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [circles, setCircles] = useState<ChatSummary[] | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const closeCompose = useCallback(() => setComposeOpen(false), [])

  const load = useCallback(async (f: Filter, after: string | null, near = coords) => {
    if (demo) {
      setItems(initial.filter((p) => matches(f, p)))
      setCaughtUp(true)
      setCursor(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams()
      const k = apiKind(f)
      if (k) q.set('kind', k)
      if (place) q.set('place', place)
      if (after && after !== 'more') q.set('cursor', after)
      if (near) { q.set('lat', String(near.lat)); q.set('lng', String(near.lng)) }
      const r = await apiFetch<FeedResponse>(`/feed?${q}`)
      const got = r.items.filter((i) => matches(f, i))
      setItems((prev) => (after ? [...prev, ...got] : got))
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

  // "Your circles" (desktop): trip and plan group chats you're in.
  useEffect(() => {
    if (demo || !signedIn) return
    apiFetch<{ items: ChatSummary[] }>('/chats?type=trip').then((r) => setCircles(r.items.slice(0, 5))).catch(() => setCircles([]))
  }, [demo, signedIn])

  function choose(f: Filter) {
    setFilter(f)
    void load(f, null)
  }

  /** Coarse, opt-in location: rounded to ~1 km before it leaves the browser. */
  function askLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: Math.round(p.coords.latitude * 100) / 100, lng: Math.round(p.coords.longitude * 100) / 100 }
        setCoords(c)
        void load(filter, null, c)
      },
      () => setError('Location is off. Suggestions use your home city instead.'),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 8000 },
    )
  }

  // Stories, plans and questions for the rail and the side columns come from everything loaded so far.
  const pool = useMemo(() => {
    const m = new Map<string, Post>()
    for (const p of [...initial, ...items.filter(isPost)]) if (!m.has(p.id)) m.set(p.id, p)
    return [...m.values()]
  }, [initial, items])
  const plansForYou = useMemo(() => {
    const sug = suggestions.filter((s) => s.type === 'plan' && s.post).map((s) => s.post!)
    return (sug.length ? sug : pool.filter((p) => p.kind === 'plan' && p.status === 'live' && !p.viewer.isAuthor)).slice(0, 2)
  }, [suggestions, pool])
  const trending = useMemo(() => pool.filter((p) => p.kind === 'ask').sort((a, b) => b.commentCount - a.commentCount).slice(0, 4), [pool])

  const composeHref = (q: string) => (signedIn ? `/tribe/new${q}` : `/login?redirectTo=${encodeURIComponent(`/tribe/new${q}`)}`)
  const current = FILTERS.find((f) => f.id === filter)!

  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-7 pb-28 pt-3 md:px-6 lg:grid-cols-[220px_minmax(0,640px)_320px] lg:justify-center lg:px-8 lg:pt-7">
      {/* Left: sections + your circles (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-1">
          <nav className="fc-sidenav space-y-1" aria-label="Tribe sections">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => choose(f.id)} aria-pressed={filter === f.id}>
                <f.icon aria-hidden strokeWidth={filter === f.id ? 2.5 : 2} />{f.label}
              </button>
            ))}
            <button type="button" onClick={askLocation} aria-pressed={!!coords}><MapPin aria-hidden />{coords ? 'Near you' : 'Near me'}</button>
          </nav>
          <p className="pc-eyebrow px-3.5 pb-2 pt-6">Your circles</p>
          {!signedIn ? (
            <p className="px-3.5 text-[13px] text-muted-foreground"><Link href="/login?redirectTo=%2Ftribe" className="pc-link">Sign in</Link> to see your trip and plan groups.</p>
          ) : circles === null ? (
            demo ? <p className="px-3.5 text-[13px] text-muted-foreground">Group chats for your trips and plans show up here.</p>
              : <div className="space-y-2 px-2.5" aria-busy="true">{[0, 1].map((i) => <div key={i} className="pc-skel h-9" />)}</div>
          ) : circles.length === 0 ? (
            <p className="px-3.5 text-[13px] text-muted-foreground">Join a trip or a plan and its group shows up here.</p>
          ) : (
            <ul className="space-y-0.5">
              {circles.map((c) => (
                <li key={c.id}>
                  <Link href={`/community/${c.id}`} className="fc-chat-row py-1.5">
                    <span className="fc-av h-9 w-9">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.image ? <img src={c.image.thumbUrl ?? c.image.url} alt="" /> : <UsersRound className="h-4 w-4 text-[color:var(--pc-pine)]" aria-hidden />}
                    </span>
                    <b className="min-w-0 flex-1 truncate text-[14px]">{c.name}</b>
                    {c.unread > 0 && <span className="fc-unread">{c.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="px-3.5 pt-6 text-xs leading-relaxed text-muted-foreground">Tribe is for plans, stories and questions between travellers. Nothing here is a booking. Paid trips are marked <span className="pc-tag pc-tag-hosted fc-tag-sm">Hosted trip</span>.</p>
        </div>
      </aside>

      {/* Centre: rail, composer prompt, feed */}
      <main className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3 px-4 md:px-0 lg:hidden">
          <div>
            <h1 className="fc-largetitle">Tribe</h1>
            {demo && <p className="mt-1 text-[13px] text-muted-foreground">Sample posts · local preview</p>}
          </div>
        </div>
        <div className="hidden lg:mb-4 lg:block">
          <h1 className="text-[30px] leading-none">{filter === 'all' ? 'Tribe' : current.label}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Plans, stories and questions from travellers{demo ? ' · sample posts (local preview)' : ''}</p>
        </div>

        <div className="fc-rail-wrap lg:mb-4 lg:rounded-[var(--pc-radius-card)] lg:border lg:border-[color:var(--pc-rule)] lg:bg-[color:var(--pc-raised)] lg:px-4 lg:pb-2 lg:pt-4">
          <StoryRail posts={pool} me={me ?? null} signedIn={signedIn} demo={demo} className="lg:px-0" />
        </div>

        <div className="mb-4 hidden lg:block">
          <div className="fc-composer-prompt">
            {me ? <Avatar user={me} size={40} /> : <span className="fc-av h-10 w-10"><Plus className="h-5 w-5" aria-hidden /></span>}
            {signedIn
              ? <button type="button" className="fc-composer-prompt-main" onClick={() => setComposeOpen(true)}>Planning something? Ask, share or start a plan…</button>
              : <Link href="/login?redirectTo=%2Ftribe" className="fc-composer-prompt-main">Sign in to plan, ask or share a story…</Link>}
            <Link href={composeHref('?kind=plan')} className="pc-chip"><UsersRound className="h-4 w-4" aria-hidden />Plan</Link>
            <Link href={composeHref('?kind=ask&poll=1')} className="pc-chip"><ChartBar className="h-4 w-4" aria-hidden />Poll</Link>
            <Link href={composeHref('?kind=ask')} className="pc-chip"><MessageCircleQuestionMark className="h-4 w-4" aria-hidden />Ask</Link>
          </div>
        </div>

        {/* Feed filters stay near the top on phones (scanned, not tapped often). */}
        <div className="sticky top-0 z-20 -mt-1 mb-3 bg-[color:var(--pc-paper)]/95 pb-2.5 pt-3 backdrop-blur lg:hidden">
          <div className="fc-scroll-x gap-2 px-4 md:px-0" role="toolbar" aria-label="Filter posts">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="pc-chip" aria-pressed={filter === f.id} onClick={() => choose(f.id)}>{f.label}</button>
            ))}
            <button type="button" className="pc-chip" aria-pressed={!!coords} onClick={askLocation}><MapPin className="h-3.5 w-3.5" aria-hidden /> Near me</button>
          </div>
        </div>

        <div className="px-3.5 md:px-0">
          {place && (
            <p className="mb-3 text-sm">Showing <strong className="capitalize">{place.replace(/-/g, ' ')}</strong> · <Link href="/tribe" className="pc-link">Show everywhere</Link></p>
          )}

          {items.length === 0 && !loading ? (
            <EmptyFeed filter={filter} composeHref={composeHref} />
          ) : (
            <ul className="space-y-3 lg:space-y-4">
              {items.map((it, i) => (
                <li key={'id' in it ? it.id : `placed-${it.trip.id}-${i}`}>
                  {it.kind === 'placed_trip'
                    ? <TripStub trip={it.trip} placed />
                    : <PostCard post={it} signedIn={signedIn} demo={demo} priority={i < 2} />}
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error} <button className="pc-link underline" onClick={() => load(filter, null)}>Retry</button></p>}
          {loading && <div className="mt-4 space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="pc-skel h-56 rounded-[var(--pc-radius-card)]" />)}</div>}
          {!loading && cursor && !caughtUp && (
            <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4" onClick={() => load(filter, cursor)}>Show more</button>
          )}
          {caughtUp && items.length > 0 && departures.length > 0 && (
            <section className="mt-8" aria-label="You're caught up">
              <h2 className="text-[20px]">You’re caught up</h2>
              <p className="text-sm text-muted-foreground">Leaving next on UnSOLO</p>
              <div className="mt-3 space-y-2.5">{departures.map((t) => <TripStub key={t.id} trip={t} />)}</div>
            </section>
          )}
        </div>
      </main>

      {/* Right: plans for you + trending questions (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-4">
          <div className="pc-section-h"><h2 className="text-[20px]">Plans for you</h2>{plansForYou.length > 0 && <button type="button" className="pc-link text-sm" onClick={() => choose('plan')}>See all</button>}</div>
          {plansForYou.length === 0 ? (
            <div className="pc-pencilled p-4 text-sm text-muted-foreground">
              No open plans near your dates yet. <Link href={composeHref('?kind=plan')} className="pc-link">Start one</Link> and people going your way can ask to join.
            </div>
          ) : plansForYou.map((p) => <PlanCard key={p.id} post={p} signedIn={signedIn} demo={demo} ringSize={96} compact />)}
          <section className="pc-card p-4 pb-3" aria-label="Trending questions">
            <h2 className="text-[17px]">Trending questions</h2>
            {trending.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No questions yet. <Link href={composeHref('?kind=ask')} className="pc-link">Ask the tribe</Link></p>
            ) : (
              <ol className="mt-1">
                {trending.map((a, i) => (
                  <li key={a.id}>
                    <Link href={`/tribe/p/${a.id}`} className="flex gap-3 rounded-2xl px-1 py-2 hover:bg-[color:var(--pc-tonal)]">
                      <span className="pc-price w-4 shrink-0 text-[16px] text-[color:var(--pc-pine)]">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[14px] font-semibold leading-snug">{a.body}</span>
                        <span className="text-[12px] text-muted-foreground">{a.poll ? `${a.poll.options.reduce((s, o) => s + o.votes, 0)} votes` : `${a.commentCount} answers`}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>

      <ComposeSheet open={composeOpen} onClose={closeCompose} />
    </div>
  )
}

function EmptyFeed({ filter, composeHref }: { filter: Filter; composeHref: (q: string) => string }) {
  const copy: Record<Filter, [string, string, string, string]> = {
    all: ['Nothing here yet', 'Be the first: share where you’re headed, or a trip you loved.', 'Create a post', ''],
    plan: ['No plans yet', 'Planning a trip? Post it and people going your way can ask to join.', 'Start a plan', '?kind=plan'],
    story: ['No stories yet', 'Been somewhere lately? Photos and tips help the next person.', 'Share a story', '?kind=story'],
    question: ['No questions yet', 'Ask travellers and hosts who have been there.', 'Ask a question', '?kind=ask'],
    poll: ['No polls yet', 'Can’t decide? Let the tribe vote.', 'Start a poll', '?kind=ask&poll=1'],
    saved: ['Nothing saved', 'Tap the bookmark on a post to keep it here.', 'Back to the feed', ''],
  }
  const [h, p, cta, q] = copy[filter]
  return (
    <div className={cn('p-8 text-center', filter === 'plan' ? 'pc-pencilled' : 'pc-card')}>
      <h2 className="text-xl">{h}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{p}</p>
      {filter !== 'saved' && <Link href={composeHref(q)} className="pc-btn mt-4">{cta}</Link>}
    </div>
  )
}
