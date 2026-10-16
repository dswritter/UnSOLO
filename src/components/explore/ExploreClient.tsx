'use client'

import { useState, useEffect, useRef, useTransition, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'
import { Button } from '@/components/ui/button'
import { Mountain, Plane, Home, Compass, Navigation, Key, X, Search, Loader2, type LucideIcon } from 'lucide-react'
import { cn, listingScheduleTodayISO } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { packageHasUpcomingOpenDeparture, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { typeLabels, GETTING_AROUND_ENABLED } from '@/lib/service-listing-filters'
import { ExploreTripPackageCard } from './ExploreTripPackageCard'
import { ExploreSidebar } from './ExploreSidebar'
import { ServiceListingCard } from './ServiceListingCard'
import { MobileExploreActionBar } from './MobileExploreActionBar'
import { SearchDrawer } from './SearchDrawer'
import { FilterDrawer } from './FilterDrawer'
import { SkeletonCard } from './SkeletonCard'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'
import {
  readRecentlyViewedPackages,
  writeRecentlyViewedPackage,
  removeRecentlyViewedPackage,
  type RecentlyViewedPackage,
} from '@/lib/explore/recently-viewed-packages'
import { pushWithRouteProgress } from '@/lib/navigation/pushWithRouteProgress'
import { toggleInterest } from '@/actions/booking'
import { loadMoreExploreListings } from '@/actions/explore-listings'
import { appendUniqueById, matchesExploreSearch } from '@/lib/explore/local-search'
import { useAuth } from '@/components/layout/AuthProvider'
import { toast } from 'sonner'

type TabType = 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'
type AppendedExplorePage = {
  key: string
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  page: number
  totalCount: number
  hasMore: boolean
  spotsBooked: Record<string, number>
  interestCounts: Record<string, number>
}

// Order intentionally matches the mobile hero tab strip (trips → rentals →
// activities → stays) so users don't have to mentally re-map the categories
// when they leave the home screen.
const ALL_TABS: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'rentals', label: 'Rentals', icon: Key },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'stays', label: 'Stays', icon: Home },
  { id: 'getting_around', label: 'Getting Around', icon: Navigation },
]
const TABS = ALL_TABS.filter(t => t.id !== 'getting_around' || GETTING_AROUND_ENABLED)

/** Activities with dated schedule only: true if empty schedule or any upcoming date (India calendar compare). */
function activityExploreHasUpcomingDates(listing: ServiceListing, todayStr: string): boolean {
  if (listing.type !== 'activities') return true
  const sch = listing.event_schedule
  if (!sch?.length) return true
  return sch.some((e) => tripDepartureDateKey(e.date) >= todayStr)
}

interface ExploreClientProps {
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  params: Record<string, string>
  resultCount: number
  page: number
  hasMore: boolean
  activeTab: TabType
  interestedPackageIds?: string[]
  maxPackagePrice?: number
  spotsBooked?: Record<string, number>
  interestCounts?: Record<string, number>
  /** URL path for tab/search/filter navigation (homepage search uses `/`) */
  basePath?: string
  /** Wander: gold tabs, transparent shell on green texture */
  pageVariant?: 'default' | 'wander'
  /** Shown when results omit the location/text filter because the strict search had no hits */
  searchFallback?: boolean
  /** Rendering a cached home-row snapshot while the full result set streams in. */
  previewPending?: boolean
}

export function ExploreClient({
  packages,
  serviceListings,
  params,
  resultCount,
  page,
  hasMore,
  activeTab: initialTab,
  interestedPackageIds = [],
  maxPackagePrice = 2000000,
  spotsBooked = {},
  interestCounts = {},
  basePath = '/',
  pageVariant = 'default',
  searchFallback = false,
  previewPending = false,
}: ExploreClientProps) {
  const isWanderShell = pageVariant === 'wander'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [isTabPending, startTabTransition] = useTransition()
  // isNavigating covers external navigations (sidebar/filter changes) that we
  // don't initiate via startTabTransition. Cleared only when fresh props arrive.
  const [isNavigating, setIsNavigating] = useState(false)
  const { userId } = useAuth()
  const [interestedIds, setInterestedIds] = useState<Set<string>>(() => new Set(interestedPackageIds))
  const [interestCountMap, setInterestCountMap] = useState<Record<string, number>>(interestCounts)
  const [pendingInterestIds, setPendingInterestIds] = useState<Set<string>>(new Set())
  const prevParamsRef = useRef<string>('')
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedPackage[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [appendError, setAppendError] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [appendedPage, setAppendedPage] = useState<AppendedExplorePage | null>(null)
  const committedSearch = params.q || ''
  const [searchDraftState, setSearchDraftState] = useState({ committed: committedSearch, value: committedSearch })
  const searchDraft = searchDraftState.committed === committedSearch ? searchDraftState.value : committedSearch
  useEffect(() => { setRecentlyViewed(readRecentlyViewedPackages()) }, [])

  useEffect(() => {
    const query = searchDraft.trim()
    if (query === committedSearch.trim()) return
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString())
      if (query) next.set('q', query)
      else next.delete('q')
      next.delete('page')
      if (isWanderShell) next.set('search', '1')
      const suffix = next.toString()
      router.replace(suffix ? `${basePath}?${suffix}` : basePath, { scroll: false })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [basePath, committedSearch, isWanderShell, router, searchDraft, searchParams])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  // New tab/filters bring a fresh set of packages with their own server-provided
  // interest data — resync so stale state from the previous tab doesn't linger.
  useEffect(() => {
    setInterestedIds(new Set(interestedPackageIds))
    setInterestCountMap(interestCounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages])

  const toggleInterested = useCallback(async (packageId: string) => {
    if (!userId) {
      router.push('/login')
      return
    }
    if (pendingInterestIds.has(packageId)) return
    setPendingInterestIds(prev => new Set(prev).add(packageId))

    const wasInterested = interestedIds.has(packageId)
    setInterestedIds(prev => {
      const next = new Set(prev)
      if (wasInterested) next.delete(packageId)
      else next.add(packageId)
      return next
    })
    setInterestCountMap(prev => ({ ...prev, [packageId]: (prev[packageId] ?? 0) + (wasInterested ? -1 : 1) }))

    const result = await toggleInterest(packageId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      setInterestedIds(prev => {
        const next = new Set(prev)
        if (wasInterested) next.add(packageId)
        else next.delete(packageId)
        return next
      })
      setInterestCountMap(prev => ({ ...prev, [packageId]: (prev[packageId] ?? 0) + (wasInterested ? 1 : -1) }))
    }
    setPendingInterestIds(prev => {
      const next = new Set(prev)
      next.delete(packageId)
      return next
    })
  }, [userId, interestedIds, pendingInterestIds, router])

  // Detect navigations triggered externally (sidebar filters, search drawer).
  // URL changes via useSearchParams happen before the server finishes
  // re-rendering, so we set isNavigating here and only clear it once new
  // props actually arrive (see the packages/serviceListings effect below).
  useEffect(() => {
    const currentParams = searchParams.toString()
    if (prevParamsRef.current !== '' && prevParamsRef.current !== currentParams) {
      const previous = new URLSearchParams(prevParamsRef.current)
      const current = new URLSearchParams(currentParams)
      previous.delete('q')
      previous.delete('page')
      current.delete('q')
      current.delete('page')
      if (previous.toString() !== current.toString()) setIsNavigating(true)
    }
    prevParamsRef.current = currentParams
  }, [searchParams])

  // New props = navigation complete. Safe to hide the skeleton.
  useEffect(() => { setIsNavigating(false) }, [packages, serviceListings])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('tab', tab)
    newParams.delete('q')
    if (isWanderShell) {
      newParams.set('search', '1')
    }
    startTabTransition(() => {
      pushExploreUrl(router, basePath, `${basePath}?${newParams.toString()}`)
    })
  }

  // Show skeleton while any navigation is in-flight.
  const isLoading = isTabPending || isNavigating

  /** Call as soon as we initiate a filter URL change so the UI does not feel idle before searchParams catch up. */
  const onExploreNavigationStart = useCallback(() => {
    setIsNavigating(true)
  }, [])

    const queryKey = JSON.stringify(Object.entries(params).filter(([key]) => key !== 'page').sort(([a], [b]) => a.localeCompare(b)))
    const currentAppend = appendedPage?.key === queryKey ? appendedPage : null
    const loadedPackages = currentAppend ? [...packages, ...currentAppend.packages] : packages
    const loadedServiceListings = currentAppend ? [...serviceListings, ...currentAppend.serviceListings] : serviceListings
    const requestedSearch = searchDraft.trim()
    const localSearch = requestedSearch !== committedSearch.trim() ? requestedSearch : ''
    const visiblePackages = localSearch ? loadedPackages.filter(pkg => matchesExploreSearch([
      pkg.title, pkg.description, pkg.short_description, pkg.destination?.name, pkg.destination?.state, pkg.includes, pkg.metadata,
    ], localSearch)) : loadedPackages
    const visibleServiceListings = localSearch ? loadedServiceListings.filter(listing => matchesExploreSearch([
      listing.title, listing.description, listing.short_description, listing.location, listing.tags, listing.amenities, listing.metadata,
    ], localSearch)) : loadedServiceListings
    const isTripsTab = activeTab === 'trips'
    const results = isTripsTab ? visiblePackages : visibleServiceListings
    const nextPage = currentAppend?.page ?? page
    const canLoadMore = !localSearch && (currentAppend?.hasMore ?? hasMore)
    const totalCount = currentAppend?.totalCount ?? resultCount
    const visibleSpotsBooked = { ...spotsBooked, ...currentAppend?.spotsBooked }
    const visibleInterestCounts = { ...interestCountMap, ...currentAppend?.interestCounts }

    const handleLoadMore = async () => {
      if (loadingMore || !canLoadMore) return
      setLoadingMore(true)
      setAppendError(null)
      try {
        const next = await loadMoreExploreListings(params, nextPage + 1)
        setAppendedPage(previous => {
          const current = previous?.key === queryKey ? previous : {
            key: queryKey, packages: [], serviceListings: [], page,
            totalCount: next.resultCount, hasMore: true, spotsBooked: {}, interestCounts: {},
          }
          return {
            key: queryKey,
            packages: appendUniqueById([...packages, ...current.packages], next.packages).slice(packages.length),
            serviceListings: appendUniqueById([...serviceListings, ...current.serviceListings], next.serviceListings).slice(serviceListings.length),
            page: next.page,
            totalCount: next.resultCount,
            hasMore: next.hasMore,
            spotsBooked: { ...current.spotsBooked, ...next.spotsBooked },
            interestCounts: { ...current.interestCounts, ...next.interestCounts },
          }
        })
        setInterestCountMap(previous => ({ ...previous, ...next.interestCounts }))
        if (next.interestedPackageIds.length) {
          setInterestedIds(previous => new Set([...previous, ...next.interestedPackageIds]))
        }
      } catch (error) {
        setAppendError(error instanceof Error ? error.message : 'Could not load more listings')
      } finally {
        setLoadingMore(false)
      }
    }

    const handleSearchChange = (value: string) => {
      setSearchDraftState({ committed: committedSearch, value })
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => {
        const query = value.trim()
        const next = new URLSearchParams(window.location.search)
        if (query) next.set('q', query)
        else next.delete('q')
        next.delete('page')
        if (isWanderShell) next.set('search', '1')
        const suffix = next.toString()
        router.replace(suffix ? `${basePath}?${suffix}` : basePath, { scroll: false })
      }, 350)
    }

    const searchNoun = activeTab === 'trips' ? 'trips' : typeLabels[activeTab as ServiceListingType].toLowerCase()
    const renderSearchField = (id: string) => (
      <div role="search" className={cn(
        'flex h-9 items-center gap-2 rounded-full border pl-3 pr-1.5 transition-colors focus-within:ring-2 focus-within:ring-primary/40',
        isWanderShell ? 'border-foreground/10 bg-foreground/5 hover:bg-foreground/10 focus-within:bg-foreground/10' : 'border-border bg-secondary',
      )}>
        <label htmlFor={id} className="sr-only">Search {searchNoun}</label>
        {localSearch
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" />
          : <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <input id={id} type="search" maxLength={160} autoComplete="off" enterKeyHint="search"
          value={searchDraft}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder={`Search ${searchNoun}`}
          className="input-bare min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
        {searchDraft && <button type="button" onClick={() => handleSearchChange('')}
          className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
      </div>
    )

  const exploreCalendarToday = listingScheduleTodayISO()

  const tripsUpcomingPkgs = useMemo(
    () =>
      isTripsTab
        ? visiblePackages.filter((p) => packageHasUpcomingOpenDeparture(p, exploreCalendarToday))
        : ([] as Package[]),
    [isTripsTab, visiblePackages, exploreCalendarToday],
  )
  const tripsPastPkgs = useMemo(
    () =>
      isTripsTab
        ? visiblePackages.filter((p) => !packageHasUpcomingOpenDeparture(p, exploreCalendarToday))
        : ([] as Package[]),
      [isTripsTab, visiblePackages, exploreCalendarToday],
  )

  const activitiesLiveListings = useMemo(
    () =>
      activeTab === 'activities'
          ? visibleServiceListings.filter((l) => activityExploreHasUpcomingDates(l, exploreCalendarToday))
        : ([] as ServiceListingWithItems[]),
        [activeTab, visibleServiceListings, exploreCalendarToday],
  )
  const activitiesPastOnlyListings = useMemo(
    () =>
      activeTab === 'activities'
          ? visibleServiceListings.filter((l) => !activityExploreHasUpcomingDates(l, exploreCalendarToday))
        : ([] as ServiceListingWithItems[]),
        [activeTab, visibleServiceListings, exploreCalendarToday],
  )

  /** Upcoming-first, past after — one grid so rows flow naturally (past uses tag + muted styling). */
  const tripsDisplayOrder = useMemo(
    () => [...tripsUpcomingPkgs, ...tripsPastPkgs],
    [tripsUpcomingPkgs, tripsPastPkgs],
  )
  const pastTripPackageIds = useMemo(() => new Set(tripsPastPkgs.map((p) => p.id)), [tripsPastPkgs])

  const activitiesDisplayOrder = useMemo(
    () => [...activitiesLiveListings, ...activitiesPastOnlyListings],
    [activitiesLiveListings, activitiesPastOnlyListings],
  )
  const pastActivityIds = useMemo(
    () => new Set(activitiesPastOnlyListings.map((l) => l.id)),
    [activitiesPastOnlyListings],
  )

  const tripGridClassName = cn(
    'grid grid-cols-1 sm:grid-cols-2 gap-5',
    isWanderShell ? 'lg:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-2 xl:grid-cols-3',
  )
  const serviceGridClassName = cn(
    'grid grid-cols-1 sm:grid-cols-2 gap-5',
    isWanderShell ? 'lg:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-2 xl:grid-cols-3',
  )
  return (
    <div
      className={cn(
        'min-h-0 pb-24 md:pb-0',
        isWanderShell ? 'bg-transparent text-foreground' : 'min-h-screen bg-background',
      )}
    >
      {/* Mobile: sticky frosted tab strip — same rounded glass shell as the
          home hero. The element below has padding-top to push the strip
          away from the absolute top edge so it sits flush with a small
          inset like a card, matching the home design. */}
      {isWanderShell ? (
        <div className="md:hidden sticky top-0 z-40 px-3 pt-2 pb-1">
          <div className="rounded-2xl border border-foreground/16 bg-foreground/[0.07] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
            <div className="grid grid-cols-4 gap-1 px-1.5 py-1.5">
              {TABS.filter(t => t.id !== 'getting_around').map(tab => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                      active ? 'text-primary' : 'text-foreground/80 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0 stroke-[2]" />
                    <span className="text-[11px] font-semibold leading-tight">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        {isWanderShell ? (
          <div className="mb-4">
            <h2 className="hidden lg:block text-2xl md:text-3xl font-black tracking-tight text-foreground">Explore</h2>
            <p className="hidden lg:block mt-1 text-sm text-foreground/70">Search and filter the full catalog while you stay in Wander.</p>
          </div>
        ) : null}
        {/* Desktop tabs (mobile uses the sticky strip above). */}
        <div className="hidden md:flex mb-6 flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto pb-2 -mb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                    isWanderShell
                      ? activeTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-foreground/5 text-foreground/90 hover:bg-foreground/10'
                      : activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
          <div className="w-full max-w-xs lg:max-w-sm">{renderSearchField('explore-results-search')}</div>
        </div>

        <div className="mb-4 md:hidden">{renderSearchField('explore-results-search-mobile')}</div>

        {params.q && searchFallback ? (
          <div
            role="status"
            className={cn(
              'mb-5 rounded-xl border px-4 py-3 text-sm',
              isWanderShell
                ? 'border-foreground/20 bg-foreground/[0.06] text-foreground/90'
                : 'border-border bg-muted/50 text-foreground',
            )}
          >
            <p className="font-medium">
              We couldn&rsquo;t find an exact match for &ldquo;{params.q}&rdquo;{isTripsTab ? ' for this trip list' : ` in ${typeLabels[activeTab as ServiceListingType]}`}.
            </p>
            <p className={cn('mt-1.5', isWanderShell ? 'text-foreground/70' : 'text-muted-foreground')}>
              Here are more options you might like nearby or across the catalog — try refining your search to narrow them down.
            </p>
          </div>
        ) : null}

        {/* Recently Viewed strip — hidden when any filter is active */}
        {recentlyViewed.length > 0 && isTripsTab && !Object.entries(params).some(([k, v]) => k !== 'tab' && k !== 'q' && !!v) && (
          <div className="mb-5 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                Recently Viewed
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {recentlyViewed.map(rv => (
                <div key={rv.id} className="relative group/rv flex-shrink-0">
                  <button
                    onClick={() => {
                      if (isMobile) {
                        pushWithRouteProgress(router, `/packages/${rv.slug}`)
                        return
                      }
                      window.open(`/packages/${rv.slug}`, '_blank', 'noopener,noreferrer')
                    }}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 pr-7 hover:border-primary/40 transition-colors text-left"
                  >
                    {rv.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={storageThumbnailUrl(rv.image) || rv.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <Mountain className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold truncate max-w-[120px]">{rv.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{rv.destName}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecentlyViewedPackage(rv.id)
                      setRecentlyViewed(prev => prev.filter(p => p.id !== rv.id))
                    }}
                    className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-background/80 border border-border flex items-center justify-center opacity-0 group-hover/rv:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
                    aria-label="Remove from recently viewed"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar + Results Layout */}
        <div className="flex flex-1 items-start gap-6 lg:gap-8">
          {/* Desktop Sidebar - hidden on mobile */}
          <div className="hidden w-60 shrink-0 self-stretch lg:block">
            <ExploreSidebar
              params={params}
              resultCount={totalCount}
              activeTab={activeTab}
              isLoading={isLoading}
              maxPackagePrice={maxPackagePrice}
              basePath={basePath}
              onNavigationStart={onExploreNavigationStart}
            />
          </div>

          {/* Results Grid */}
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className={isTripsTab ? tripGridClassName : serviceGridClassName}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} variant={isTripsTab ? 'trip' : 'service'} />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-24">
                <Mountain className="h-16 w-16 text-primary/30 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">
                  No {activeTab === 'trips' ? 'trips' : typeLabels[activeTab as ServiceListingType]} found
                </h3>
                <p className="text-muted-foreground mb-4">Try adjusting your filters</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => {
                    onExploreNavigationStart()
                    pushExploreUrl(router, basePath, basePath)
                  }}
                  className="gap-2"
                >
                  {isLoading ? 'Updating results…' : 'Clear filters'}
                </Button>
              </div>
            ) : isTripsTab ? (
              <div className={tripGridClassName}>
                {tripsDisplayOrder.map((pkg) => (
                  <ExploreTripPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    pastEdition={pastTripPackageIds.has(pkg.id)}
                    spotsBooked={visibleSpotsBooked[pkg.id] ?? 0}
                    interestTotal={visibleInterestCounts[pkg.id] ?? 0}
                    interested={interestedIds.has(pkg.id)}
                    onToggleInterest={toggleInterested}
                    onOpenDetail={() => {
                      writeRecentlyViewedPackage({
                        id: pkg.id,
                        title: pkg.title,
                        slug: pkg.slug,
                        image: pkg.images?.[0] || null,
                        destName: pkg.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '',
                      })
                      if (isMobile) {
                        pushWithRouteProgress(router, `/packages/${pkg.slug}`)
                        return
                      }
                      window.open(`/packages/${pkg.slug}`, '_blank', 'noopener,noreferrer')
                    }}
                    onPrefetch={() => router.prefetch(`/packages/${pkg.slug}`)}
                  />
                ))}
              </div>
            ) : activeTab === 'activities' ? (
              <div className={serviceGridClassName}>
                {activitiesDisplayOrder.map((listing) => (
                  <ServiceListingCard
                    key={listing.id}
                    listing={listing}
                    items={listing.items}
                    muted={pastActivityIds.has(listing.id)}
                  />
                ))}
              </div>
            ) : (
              <div className={serviceGridClassName}>
                {visibleServiceListings.map((listing) => (
                  <ServiceListingCard key={listing.id} listing={listing} items={listing.items} />
                ))}
              </div>
            )}
            {previewPending && !isLoading && (
              <div className={cn(isTripsTab ? tripGridClassName : serviceGridClassName, 'mt-6')} aria-busy="true" aria-label="Loading more listings">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} variant={isTripsTab ? 'trip' : 'service'} />
                ))}
              </div>
            )}
            {!isLoading && canLoadMore && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">Showing {results.length} of {totalCount} listings</p>
                {appendError && <p role="alert" className="text-sm text-red-400">{appendError}</p>}
                <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void handleLoadMore()} className="min-w-40 gap-2">
                  {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading more…</> : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Action Bar & Drawers - hide when search is open */}
      {!searchDrawerOpen && (
        <MobileExploreActionBar
          activeTab={activeTab}
          onSearchClick={() => setSearchDrawerOpen(true)}
          onFilterClick={() => setFilterDrawerOpen(true)}
        />
      )}

      <SearchDrawer
        isOpen={searchDrawerOpen}
        onClose={() => setSearchDrawerOpen(false)}
        initialValue={params.q || ''}
        basePath={basePath}
        preserveWanderSearch={isWanderShell}
        activeTab={(activeTab === 'trips' || activeTab === 'stays' || activeTab === 'activities' || activeTab === 'rentals') ? activeTab : undefined}
      />

      <FilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        params={params}
        activeTab={activeTab}
        resultCount={resultCount}
        isLoading={isLoading}
        maxPackagePrice={maxPackagePrice}
        basePath={basePath}
        preserveWanderSearch={isWanderShell}
        onNavigationStart={onExploreNavigationStart}
      />
    </div>
  )
}
