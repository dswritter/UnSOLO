'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Mountain, Star, ShieldCheck, Plane, Home, Compass, Navigation, Heart, Key, Clock, X, ChevronLeft } from 'lucide-react'
import { formatPrice, cn, formatDate } from '@/lib/utils'
import { packageDurationShortLabel, packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import { typeEmojis, typeLabels, GETTING_AROUND_ENABLED } from '@/lib/service-listing-filters'
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

type TabType = 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

// Order intentionally matches the mobile hero tab strip (trips → rentals →
// activities → stays) so users don't have to mentally re-map the categories
// when they leave the home screen.
const ALL_TABS: { id: TabType; label: string; icon: any }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'rentals', label: 'Rentals', icon: Key },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'stays', label: 'Stays', icon: Home },
  { id: 'getting_around', label: 'Getting Around', icon: Navigation },
]
const TABS = ALL_TABS.filter(t => t.id !== 'getting_around' || GETTING_AROUND_ENABLED)

// Frosted glass over the hero image — saturated blur reads cleanly on every
// background, hairline white border keeps the chip distinct from the photo.
const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-white/15 text-white backdrop-blur-md backdrop-saturate-150 border-white/20 shadow-sm',
  moderate: 'bg-white/15 text-white backdrop-blur-md backdrop-saturate-150 border-white/20 shadow-sm',
  challenging: 'bg-white/15 text-white backdrop-blur-md backdrop-saturate-150 border-white/20 shadow-sm',
}

const DIFFICULTY_ICONS: Record<string, string> = {
  easy: '\u2714',
  moderate: '\u26A0',
  challenging: '\u26A1',
}

const GENDER_LABELS: Record<string, string> = {
  women: 'Women only',
  men: 'Men only',
  all: 'All genders',
}

interface ExploreClientProps {
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  params: Record<string, string>
  resultCount: number
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
}

export function ExploreClient({
  packages,
  serviceListings,
  params,
  resultCount,
  activeTab: initialTab,
  interestedPackageIds = [],
  maxPackagePrice = 2000000,
  spotsBooked = {},
  interestCounts = {},
  basePath = '/',
  pageVariant = 'default',
  searchFallback = false,
}: ExploreClientProps) {
  const isWanderShell = pageVariant === 'wander'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  // isNavigating covers external navigations (sidebar/filter changes) that we
  // don't initiate via startTransition. Cleared only when fresh props arrive.
  const [isNavigating, setIsNavigating] = useState(false)
  const [wishlisted, setWishlisted] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('wishlisted_packages')
    return new Set(saved ? JSON.parse(saved) : [])
  })
  const prevParamsRef = useRef<string>('')
  const interestedSet = new Set(interestedPackageIds)
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedPackage[]>([])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => { setRecentlyViewed(readRecentlyViewedPackages()) }, [])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const toggleWishlist = (packageId: string) => {
    setWishlisted(prev => {
      const newSet = new Set(prev)
      if (newSet.has(packageId)) {
        newSet.delete(packageId)
      } else {
        newSet.add(packageId)
      }
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('wishlisted_packages', JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }

  // Detect navigations triggered externally (sidebar filters, search drawer).
  // URL changes via useSearchParams happen before the server finishes
  // re-rendering, so we set isNavigating here and only clear it once new
  // props actually arrive (see the packages/serviceListings effect below).
  useEffect(() => {
    const currentParams = searchParams.toString()
    if (prevParamsRef.current !== '' && prevParamsRef.current !== currentParams) {
      setIsNavigating(true)
    }
    prevParamsRef.current = currentParams
  }, [searchParams])

  // New props = navigation complete. Safe to hide the skeleton.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setIsNavigating(false) }, [packages, serviceListings])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('tab', tab)
    newParams.delete('q')
    if (isWanderShell) {
      newParams.set('search', '1')
    }
    startTransition(() => {
      pushExploreUrl(router, basePath, `${basePath}?${newParams.toString()}`)
    })
  }

  // Show skeleton while any navigation is in-flight.
  const isLoading = isPending || isNavigating

  const isTripsTab = activeTab === 'trips'
  const isServiceTab = !isTripsTab
  const results = isTripsTab ? packages : serviceListings

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
          <div className="rounded-2xl border border-white/16 bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
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
                      active ? 'text-primary' : 'text-white/80 hover:text-white',
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
            <h2 className="hidden lg:block text-2xl md:text-3xl font-black tracking-tight text-white">Explore</h2>
            <p className="hidden lg:block mt-1 text-sm text-white/70">Search and filter the full catalog while you stay in Wander.</p>
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
                        : 'bg-white/5 text-white/90 hover:bg-white/10'
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
        </div>

        {params.q && searchFallback ? (
          <div
            role="status"
            className={cn(
              'mb-5 rounded-xl border px-4 py-3 text-sm',
              isWanderShell
                ? 'border-white/20 bg-white/[0.06] text-white/90'
                : 'border-border bg-muted/50 text-foreground',
            )}
          >
            <p className="font-medium">
              We couldn&rsquo;t find an exact match for &ldquo;{params.q}&rdquo;{isTripsTab ? ' for this trip list' : ` in ${typeLabels[activeTab as ServiceListingType]}`}.
            </p>
            <p className={cn('mt-1.5', isWanderShell ? 'text-white/70' : 'text-muted-foreground')}>
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
                        router.push(`/packages/${rv.slug}`)
                        return
                      }
                      window.open(`/packages/${rv.slug}`, '_blank', 'noopener,noreferrer')
                    }}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 pr-7 hover:border-primary/40 transition-colors text-left"
                  >
                    {rv.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rv.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
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
        <div className="flex gap-6 flex-1">
          {/* Desktop Sidebar - hidden on mobile */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <ExploreSidebar
              params={params}
              resultCount={resultCount}
              activeTab={activeTab}
              isLoading={isLoading}
              maxPackagePrice={maxPackagePrice}
              basePath={basePath}
            />
          </div>

          {/* Results Grid */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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
                <Button asChild variant="outline">
                  <Link href={basePath}>Clear filters</Link>
                </Button>
              </div>
            ) : isTripsTab ? (
              /* Trips Grid */
              <div
                className={cn(
                  'grid grid-cols-1 sm:grid-cols-2 gap-6',
                  isWanderShell ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-2 xl:grid-cols-3',
                )}
              >
            {(packages as Package[]).map((pkg) => {
              const spotsLeft = pkg.max_group_size - (spotsBooked[pkg.id] || 0)
              const interestTotal = interestCounts[pkg.id] || 0
              const nextDeparture = packageNextDepartureLine(pkg)
              return (
              <div
                key={pkg.id}
                onClick={() => {
                  writeRecentlyViewedPackage({
                    id: pkg.id, title: pkg.title, slug: pkg.slug,
                    image: pkg.images?.[0] || null,
                    destName: pkg.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '',
                  })
                  if (isMobile) {
                    router.push(`/packages/${pkg.slug}`)
                    return
                  }
                  window.open(`/packages/${pkg.slug}`, '_blank', 'noopener,noreferrer')
                }}
                onMouseEnter={() => router.prefetch(`/packages/${pkg.slug}`)}
                onFocus={() => router.prefetch(`/packages/${pkg.slug}`)}
                className="cursor-pointer"
              >
                <Card
                  className={cn(
                    'bg-card border-border overflow-hidden cursor-pointer h-full group py-0 gap-0',
                    'transition-all duration-300 hover:shadow-xl hover:scale-[1.02]',
                    'motion-reduce:transition-none motion-reduce:hover:scale-100',
                    'hover:bg-gradient-to-br hover:from-card hover:to-secondary/50',
                    pkg.host_id
                      ? 'ring-2 ring-blue-500/50 bg-gradient-to-br from-card to-blue-500/5'
                      : ''
                  )}
                >
                  <div className="relative h-52 bg-secondary overflow-hidden shrink-0 rounded-t-xl">
                    {pkg.images?.[0] ? (
                      <Image
                        src={pkg.images[0]}
                        alt={pkg.title}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <Mountain className="h-14 w-14 text-primary/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                      <Badge className={`text-xs ${DIFFICULTY_COLORS[pkg.difficulty]}`}>
                        {DIFFICULTY_ICONS[pkg.difficulty] || ''} {pkg.difficulty}
                      </Badge>
                      {pkg.is_featured && (
                        <Badge className="text-xs bg-primary/90 text-black border-none">Featured</Badge>
                      )}
                      {pkg.host_id && (
                        <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">Community</Badge>
                      )}
                      {spotsLeft > 0 && spotsLeft <= 5 && (
                        <Badge className="text-xs bg-red-500/80 text-white border-none">Only {spotsLeft} left!</Badge>
                      )}
                    </div>

                    {/* Wishlist heart button - synced with interest status */}
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleWishlist(pkg.id)
                      }}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-all z-10 backdrop-blur-sm"
                      aria-label="Add to wishlist"
                    >
                      <Heart
                        className={cn(
                          'h-5 w-5 transition-all duration-300',
                          wishlisted.has(pkg.id) || interestedSet.has(pkg.id)
                            ? 'fill-red-500 text-red-500 scale-110'
                            : 'text-white/80 hover:text-white'
                        )}
                      />
                    </button>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/80">
                      <MapPin className="h-3 w-3" />
                      {pkg.destination?.name}, {pkg.destination?.state}
                    </div>

                    {/* Host avatar overlay for community trips */}
                    {pkg.host_id && pkg.host && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1 pr-2.5 py-1">
                        {pkg.host.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pkg.host.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                            {(pkg.host.full_name || pkg.host.username || 'H')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-[10px] text-white/90 font-medium truncate max-w-[80px]">
                          {pkg.host.full_name || pkg.host.username}
                        </span>
                        {pkg.host.is_verified && <ShieldCheck className="h-3 w-3 text-blue-400 flex-shrink-0" />}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-foreground text-lg leading-tight mb-1">{pkg.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{pkg.short_description}</p>

                    {/* Host info for community trips */}
                    {pkg.host_id && pkg.host && (
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                        {pkg.host.host_rating != null && pkg.host.host_rating > 0 && (
                          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                            <span>{pkg.host.host_rating.toFixed(1)}</span>
                          </div>
                        )}
                        {/* Join preference badges */}
                        {pkg.join_preferences && (
                          <div className="flex flex-wrap gap-1">
                            {pkg.join_preferences.gender_preference &&
                              pkg.join_preferences.gender_preference !== 'all' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                                  {GENDER_LABELS[pkg.join_preferences.gender_preference]}
                                </span>
                              )}
                            {pkg.join_preferences.min_trips_completed &&
                              pkg.join_preferences.min_trips_completed > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                                  {pkg.join_preferences.min_trips_completed}+ trips
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-primary font-black text-xl">
                          {hasTieredPricing(pkg.price_variants) ? 'From ' : ''}
                          {formatPrice(pkg.price_paise)}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">/ person</span>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-xs font-semibold text-foreground tabular-nums">
                          {packageDurationShortLabel(pkg)}
                        </div>
                        {nextDeparture ? (
                          <div className="text-[11px] font-medium text-primary leading-tight">{nextDeparture}</div>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground">Max {pkg.max_group_size} people</div>
                      </div>
                    </div>
                    {/* Cancellations & refunds link removed from cards —
                        kept only on the trip detail page. */}
                    {interestTotal > 0 && (
                      <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                        <Heart className="h-3 w-3 text-red-400 fill-red-400" />
                        {interestTotal} {interestTotal === 1 ? 'person' : 'people'} interested
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              )
            })}
          </div>
            ) : (
              /* Service Listings Grid */
              <div
                className={cn(
                  'grid grid-cols-1 md:grid-cols-2 gap-4',
                  isWanderShell ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-2 xl:grid-cols-3',
                )}
              >
                {serviceListings.map((listing) => (
                  <ServiceListingCard key={listing.id} listing={listing} items={listing.items} />
                ))}
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
      />
    </div>
  )
}
