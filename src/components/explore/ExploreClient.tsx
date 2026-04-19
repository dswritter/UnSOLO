'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Mountain, Star, ShieldCheck, Plane, Home, Compass, Zap, Navigation } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import { typeEmojis, typeLabels } from '@/lib/service-listing-filters'
import { ExploreFilters } from '@/app/(main)/explore/ExploreFilters'
import { ServiceListingCard } from './ServiceListingCard'

type TabType = 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

const TABS: { id: TabType; label: string; icon: any }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'stays', label: 'Stays', icon: Home },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'rentals', label: 'Rentals', icon: Zap },
  { id: 'getting_around', label: 'Getting Around', icon: Navigation },
]

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-black/60 text-white backdrop-blur-sm border-white/10',
  moderate: 'bg-black/60 text-white backdrop-blur-sm border-white/10',
  challenging: 'bg-black/60 text-white backdrop-blur-sm border-white/10',
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
  serviceListings: ServiceListing[]
  params: Record<string, string>
  resultCount: number
  activeTab: TabType
}

export function ExploreClient({
  packages,
  serviceListings,
  params,
  resultCount,
  activeTab: initialTab,
}: ExploreClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('tab', tab)
    newParams.delete('q') // Clear search on tab change (will re-run in new tab)
    router.push(`/explore?${newParams.toString()}`)
  }

  const isTripsTab = activeTab === 'trips'
  const isServiceTab = !isTripsTab
  const results = isTripsTab ? packages : serviceListings

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <ExploreFilters params={params} resultCount={resultCount} activeTab={activeTab} />

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="text-center py-24">
            <Mountain className="h-16 w-16 text-primary/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">
              No {activeTab === 'trips' ? 'trips' : typeLabels[activeTab as ServiceListingType]} found
            </h3>
            <p className="text-muted-foreground mb-4">Try adjusting your filters</p>
            <Button asChild variant="outline">
              <Link href="/explore">Clear filters</Link>
            </Button>
          </div>
        ) : isTripsTab ? (
          /* Trips Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(packages as Package[]).map((pkg) => (
              <Link key={pkg.id} href={`/packages/${pkg.slug}`}>
                <Card
                  className={`bg-card border-border overflow-hidden card-hover cursor-pointer h-full group py-0 gap-0 ${
                    pkg.host_id ? 'ring-1 ring-primary/10' : ''
                  }`}
                >
                  <div className="relative h-52 bg-secondary overflow-hidden shrink-0 rounded-t-xl">
                    {pkg.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pkg.images[0]}
                        alt={pkg.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <Mountain className="h-14 w-14 text-primary/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge className={`text-xs ${DIFFICULTY_COLORS[pkg.difficulty]}`}>
                        {DIFFICULTY_ICONS[pkg.difficulty] || ''} {pkg.difficulty}
                      </Badge>
                      {pkg.is_featured && (
                        <Badge className="text-xs bg-primary/90 text-black border-none">Featured</Badge>
                      )}
                      {pkg.host_id && (
                        <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">Community</Badge>
                      )}
                    </div>
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

                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-primary font-black text-xl">
                          {hasTieredPricing(pkg.price_variants) ? 'From ' : ''}
                          {formatPrice(pkg.price_paise)}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">/ person</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{packageDurationShortLabel(pkg)}</div>
                        <div className="text-xs text-muted-foreground">Max {pkg.max_group_size} people</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          /* Service Listings Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(serviceListings as ServiceListing[]).map((listing) => (
              <ServiceListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
