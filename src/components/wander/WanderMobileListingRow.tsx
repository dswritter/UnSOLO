'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { loadMoreWanderListings } from '@/actions/wander-listings'
import type { ExploreListPayload } from '@/lib/explore/explorePageData'
import { appendUniqueById } from '@/lib/explore/local-search'
import { listingScheduleTodayISO } from '@/lib/utils'
import { packageHasUpcomingOpenDeparture, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { ServiceListingCard } from '@/components/explore/ServiceListingCard'
import { WanderTripCard } from '@/components/wander/WanderTripCard'

type RowKind = 'trips' | 'stays' | 'activities' | 'rentals'
type ServiceWithItems = ExploreListPayload['serviceListings'][number]
type Trip = ExploreListPayload['packages'][number]

const cardClass = 'w-[66vw] max-w-[17rem] shrink-0 snap-start sm:w-[15rem]'

export function WanderMobileListingRow({ children, initialIds, kind, viewAllHref, viewAllLabel }: {
  children: ReactNode[]
  initialIds: string[]
  kind: RowKind
  viewAllHref: string
  viewAllLabel: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef(false)
  const nextPageRef = useRef(1)
  const seenRef = useRef(new Set(initialIds))
  const [interacted, setInteracted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [trips, setTrips] = useState<Trip[]>([])
  const [services, setServices] = useState<ServiceWithItems[]>([])
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({})
  const [spotsBooked, setSpotsBooked] = useState<Record<string, number>>({})

  const loadMore = useCallback(async () => {
    if (pendingRef.current || !hasMore) return
    pendingRef.current = true
    setLoading(true)
    setError(false)
    try {
      // Home previews and Explore have different ordering. Start at page 1,
      // removing preview IDs rather than skipping potentially unseen listings.
      let foundNew = false
      let more = true
      while (!foundNew && more) {
        const next = await loadMoreWanderListings(kind, nextPageRef.current)
        const newTrips = next.packages.filter(p => !seenRef.current.has(p.id))
        const newServices = next.serviceListings.filter(p => !seenRef.current.has(p.id))
        for (const item of [...newTrips, ...newServices]) seenRef.current.add(item.id)
        nextPageRef.current = next.page + 1
        more = next.hasMore
        foundNew = newTrips.length > 0 || newServices.length > 0
        setTrips(previous => appendUniqueById(previous, newTrips))
        setServices(previous => appendUniqueById(previous, newServices))
        setInterestCounts(previous => ({ ...previous, ...next.interestCounts }))
        setSpotsBooked(previous => ({ ...previous, ...next.spotsBooked }))
        setHasMore(more)
      }
    } catch {
      setError(true)
    } finally {
      pendingRef.current = false
      setLoading(false)
    }
  }, [kind, hasMore])

  useEffect(() => {
    const track = trackRef.current
    const end = endRef.current
    if (!interacted || !hasMore || error || !track || !end || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore()
    }, { root: track, rootMargin: '0px 160px', threshold: 0 })
    observer.observe(end)
    return () => observer.disconnect()
  }, [interacted, hasMore, error, loadMore, trips.length, services.length])

  const today = listingScheduleTodayISO()
  const extraCards = kind === 'trips'
    ? trips.map(pkg => (
      <WanderTripCard key={pkg.id} pkg={pkg} pastEdition={!packageHasUpcomingOpenDeparture(pkg, today)}
        interestCount={interestCounts[pkg.id] ?? 0} spotsBooked={spotsBooked[pkg.id] ?? 0} />
    ))
    : services.map(listing => (
      <ServiceListingCard key={listing.id} listing={listing} items={listing.items}
        muted={listing.type === 'activities' && !!listing.event_schedule?.length &&
          !listing.event_schedule.some(event => tripDepartureDateKey(event.date) >= today)} />
    ))

  return (
    <div className="md:hidden">
      <div ref={trackRef} role="region" aria-label={`${kind} listings`} tabIndex={0}
        onScroll={() => {
          if ((trackRef.current?.scrollLeft ?? 0) > 8) setInteracted(true)
        }}
        className="-mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-3 scroll-px-4 sm:-mx-6 sm:px-6 sm:scroll-px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children.map((child, i) => <div key={initialIds[i]} className={cardClass}>{child}</div>)}
        {extraCards.map(child => <div key={child.key} className={cardClass}>{child}</div>)}
        <div ref={endRef} className="flex w-32 shrink-0 snap-start flex-col items-center justify-center gap-3 px-2 text-center">
          {loading ? (
            <span role="status" className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" />Loading more…
            </span>
          ) : error ? (
            <>
              <p role="alert" className="text-xs text-muted-foreground">Couldn&apos;t load more listings.</p>
              <button type="button" onClick={() => void loadMore()} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
                <RotateCcw className="h-4 w-4" />Retry
              </button>
            </>
          ) : hasMore ? (
            <button type="button" onClick={() => { setInteracted(true); void loadMore() }}
              className="min-h-11 text-sm font-semibold text-primary">Load more</button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">You&apos;re all caught up</p>
              <Link href={viewAllHref} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
                {viewAllLabel}<ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
