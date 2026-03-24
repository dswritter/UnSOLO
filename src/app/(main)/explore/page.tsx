export const revalidate = 300 // 5 minutes

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Mountain, Star, ShieldCheck } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import Link from 'next/link'
import type { Package } from '@/types'
import { ExploreFilters } from './ExploreFilters'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  challenging: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const GENDER_LABELS: Record<string, string> = {
  women: 'Women only',
  men: 'Men only',
  all: 'All genders',
}

async function getPackages(searchParams: Record<string, string>) {
  const supabase = await createClient()
  const tab = searchParams.tab || 'unsolo'

  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })

  // Tab filtering
  if (tab === 'community') {
    query = query.not('host_id', 'is', null).eq('moderation_status', 'approved')
  } else {
    query = query.is('host_id', null)
  }

  if (searchParams.difficulty) {
    query = query.eq('difficulty', searchParams.difficulty)
  }
  if (searchParams.minBudget) {
    query = query.gte('price_paise', parseInt(searchParams.minBudget) * 100)
  }
  if (searchParams.maxBudget) {
    query = query.lte('price_paise', parseInt(searchParams.maxBudget) * 100)
  }
  if (searchParams.maxDays) {
    query = query.lte('duration_days', parseInt(searchParams.maxDays))
  }
  if (searchParams.minDays) {
    query = query.gte('duration_days', parseInt(searchParams.minDays))
  }

  const { data } = await query
  let packages = (data || []) as unknown as Package[]

  // Hide trips where ALL departure dates are in the past
  const todayStr = new Date().toISOString().split('T')[0]
  packages = packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true // no dates = always show
    return pkg.departure_dates.some(d => d >= todayStr)
  })

  if (searchParams.month) {
    const targetMonth = parseInt(searchParams.month)
    packages = packages.filter(pkg => {
      if (!pkg.departure_dates || pkg.departure_dates.length === 0) return false
      return pkg.departure_dates.some(d => new Date(d).getMonth() === targetMonth)
    })
  }

  // Filter by user's interested packages
  if (searchParams.interested) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: interests } = await supabase
        .from('package_interests')
        .select('package_id')
        .eq('user_id', user.id)
      const interestedIds = new Set((interests || []).map(i => i.package_id))
      packages = packages.filter(pkg => interestedIds.has(pkg.id))
    }
  }

  return packages
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const tab = params.tab || 'unsolo'
  const packages = await getPackages(params)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black">
            Explore <span className="text-primary">India</span>
          </h1>
          <p className="text-muted-foreground mt-2">Discover solo travel experiences across the subcontinent</p>
        </div>

        {/* Compact filters */}
        <ExploreFilters params={params} resultCount={packages.length} />

        {/* Package grid */}
        {packages.length === 0 ? (
          <div className="text-center py-24">
            <Mountain className="h-16 w-16 text-primary/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No trips found</h3>
            <p className="text-muted-foreground mb-4">Try adjusting your filters</p>
            <Button asChild variant="outline">
              <Link href="/explore">Clear filters</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <Link key={pkg.id} href={`/packages/${pkg.slug}`}>
                <Card className={`bg-card border-border overflow-hidden card-hover cursor-pointer h-full group ${
                  tab === 'community' ? 'ring-1 ring-primary/10' : ''
                }`}>
                  <div className="relative h-52 bg-secondary overflow-hidden">
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
                        {pkg.difficulty}
                      </Badge>
                      {pkg.is_featured && (
                        <Badge className="text-xs bg-primary/90 text-black border-none">Featured</Badge>
                      )}
                      {tab === 'community' && (
                        <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">Community</Badge>
                      )}
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/80">
                      <MapPin className="h-3 w-3" />
                      {pkg.destination?.name}, {pkg.destination?.state}
                    </div>

                    {/* Host avatar overlay for community trips */}
                    {tab === 'community' && pkg.host && (
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
                    {tab === 'community' && pkg.host && (
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
                            {pkg.join_preferences.gender_preference && pkg.join_preferences.gender_preference !== 'all' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                                {GENDER_LABELS[pkg.join_preferences.gender_preference]}
                              </span>
                            )}
                            {pkg.join_preferences.min_trips_completed && pkg.join_preferences.min_trips_completed > 0 && (
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
                        <span className="text-primary font-black text-xl">{formatPrice(pkg.price_paise)}</span>
                        <span className="text-muted-foreground text-xs ml-1">/ person</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{pkg.duration_days} days</div>
                        <div className="text-xs text-muted-foreground">Max {pkg.max_group_size} people</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
