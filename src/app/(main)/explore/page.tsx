export const revalidate = 300 // 5 minutes

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Mountain, Star, ShieldCheck } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import Link from 'next/link'
import type { Package } from '@/types'
import { ExploreFilters } from './ExploreFilters'

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

function packageRecencyMs(pkg: Package): number {
  const u = pkg.updated_at
  const t = u && u.length > 0 ? new Date(u).getTime() : new Date(pkg.created_at).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortExplorePackages(
  packages: Package[],
  bookedGuests: Map<string, number>,
  interestCount: Map<string, number>,
): Package[] {
  return [...packages].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    const popA = (bookedGuests.get(a.id) || 0) + (interestCount.get(a.id) || 0)
    const popB = (bookedGuests.get(b.id) || 0) + (interestCount.get(b.id) || 0)
    if (popB !== popA) return popB - popA
    const rec = packageRecencyMs(b) - packageRecencyMs(a)
    if (rec !== 0) return rec
    return a.slug.localeCompare(b.slug)
  })
}

async function fetchPopularityMaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageIds: string[],
): Promise<{ bookedGuests: Map<string, number>; interestCount: Map<string, number> }> {
  const bookedGuests = new Map<string, number>()
  const interestCount = new Map<string, number>()
  if (packageIds.length === 0) return { bookedGuests, interestCount }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('package_id, guests')
    .in('package_id', packageIds)
    .in('status', ['confirmed', 'completed'])

  for (const b of bookings || []) {
    const pid = b.package_id as string
    const g = typeof b.guests === 'number' && b.guests > 0 ? b.guests : 1
    bookedGuests.set(pid, (bookedGuests.get(pid) || 0) + g)
  }

  const { data: interests } = await supabase
    .from('package_interests')
    .select('package_id')
    .in('package_id', packageIds)

  for (const row of interests || []) {
    const pid = row.package_id as string
    interestCount.set(pid, (interestCount.get(pid) || 0) + 1)
  }

  return { bookedGuests, interestCount }
}

async function getPackages(searchParams: Record<string, string>) {
  const supabase = await createClient()
  const tab = searchParams.tab

  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
    .eq('is_active', true)

  if (tab === 'community') {
    query = query.not('host_id', 'is', null)
  } else if (tab === 'unsolo') {
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

  // Hide trips where every departure is past or host-marked full
  const todayStr = new Date().toISOString().split('T')[0]
  packages = packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    return pkg.departure_dates.some(d => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  })

  // Text search
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase()
    packages = packages.filter(pkg => {
      const dest = pkg.destination as { name?: string; state?: string } | null
      return (
        pkg.title.toLowerCase().includes(q) ||
        (pkg.short_description || '').toLowerCase().includes(q) ||
        (dest?.name || '').toLowerCase().includes(q) ||
        (dest?.state || '').toLowerCase().includes(q)
      )
    })
  }

  if (searchParams.month) {
    const targetMonth = parseInt(searchParams.month)
    packages = packages.filter(pkg => {
      if (!pkg.departure_dates || pkg.departure_dates.length === 0) return false
      const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
      return pkg.departure_dates.some(d => {
        if (closed.has(tripDepartureDateKey(d))) return false
        return new Date(d).getMonth() === targetMonth
      })
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

  const ids = packages.map((p) => p.id)
  const { bookedGuests, interestCount } = await fetchPopularityMaps(supabase, ids)
  packages = sortExplorePackages(packages, bookedGuests, interestCount)

  return packages
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const packages = await getPackages(params)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
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
        )}
      </div>
    </div>
  )
}
