import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Mountain, Filter, Calendar, IndianRupee, Clock, X } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import Link from 'next/link'
import type { Package } from '@/types'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  challenging: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function getPackages(searchParams: Record<string, string>) {
  const supabase = await createClient()
  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })

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
  let packages = (data || []) as Package[]

  // Client-side filter for month (departure dates)
  if (searchParams.month) {
    const targetMonth = parseInt(searchParams.month) // 0-indexed
    packages = packages.filter(pkg => {
      if (!pkg.departure_dates || pkg.departure_dates.length === 0) return false
      return pkg.departure_dates.some(d => new Date(d).getMonth() === targetMonth)
    })
  }

  return packages
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const packages = await getPackages(params)

  const activeFilters = Object.keys(params).filter(k => params[k] && k !== 'page')

  function buildUrl(key: string, value: string | null) {
    const newParams = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (k !== key && v) newParams.set(k, v)
    })
    if (value) newParams.set(key, value)
    const qs = newParams.toString()
    return `/explore${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-7xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black">
            Explore <span className="text-primary">India</span>
          </h1>
          <p className="text-muted-foreground mt-2">Discover solo travel experiences across the subcontinent</p>
        </div>

        {/* Filters */}
        <div className="space-y-4 mb-8 pb-6 border-b border-border">
          {/* Difficulty */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground w-20">
              <Filter className="h-4 w-4" />
              <span>Level:</span>
            </div>
            {['all', 'easy', 'moderate', 'challenging'].map((d) => (
              <Link
                key={d}
                href={d === 'all' ? buildUrl('difficulty', null) : buildUrl('difficulty', d)}
              >
                <Badge
                  variant="outline"
                  className={`cursor-pointer capitalize hover:bg-primary/20 hover:border-primary/40 transition-colors ${
                    (params.difficulty === d || (!params.difficulty && d === 'all'))
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {d === 'all' ? 'All Trips' : d}
                </Badge>
              </Link>
            ))}
          </div>

          {/* Budget range */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground w-20">
              <IndianRupee className="h-4 w-4" />
              <span>Budget:</span>
            </div>
            {[
              { label: 'All', min: null, max: null },
              { label: 'Under ₹10K', min: null, max: '10000' },
              { label: '₹10K-20K', min: '10000', max: '20000' },
              { label: '₹20K-35K', min: '20000', max: '35000' },
              { label: '₹35K+', min: '35000', max: null },
            ].map((b) => {
              const isActive = (params.minBudget === (b.min || '') && params.maxBudget === (b.max || ''))
                || (!params.minBudget && !params.maxBudget && !b.min && !b.max)
              return (
                <Link
                  key={b.label}
                  href={(() => {
                    const p = new URLSearchParams()
                    Object.entries(params).forEach(([k, v]) => {
                      if (k !== 'minBudget' && k !== 'maxBudget' && v) p.set(k, v)
                    })
                    if (b.min) p.set('minBudget', b.min)
                    if (b.max) p.set('maxBudget', b.max)
                    const qs = p.toString()
                    return `/explore${qs ? `?${qs}` : ''}`
                  })()}
                >
                  <Badge
                    variant="outline"
                    className={`cursor-pointer hover:bg-primary/20 hover:border-primary/40 transition-colors ${
                      isActive ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {b.label}
                  </Badge>
                </Link>
              )
            })}
          </div>

          {/* Duration */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground w-20">
              <Clock className="h-4 w-4" />
              <span>Days:</span>
            </div>
            {[
              { label: 'All', min: null, max: null },
              { label: '1-3 days', min: '1', max: '3' },
              { label: '4-7 days', min: '4', max: '7' },
              { label: '8+ days', min: '8', max: null },
            ].map((d) => {
              const isActive = (params.minDays === (d.min || '') && params.maxDays === (d.max || ''))
                || (!params.minDays && !params.maxDays && !d.min && !d.max)
              return (
                <Link
                  key={d.label}
                  href={(() => {
                    const p = new URLSearchParams()
                    Object.entries(params).forEach(([k, v]) => {
                      if (k !== 'minDays' && k !== 'maxDays' && v) p.set(k, v)
                    })
                    if (d.min) p.set('minDays', d.min)
                    if (d.max) p.set('maxDays', d.max)
                    const qs = p.toString()
                    return `/explore${qs ? `?${qs}` : ''}`
                  })()}
                >
                  <Badge
                    variant="outline"
                    className={`cursor-pointer hover:bg-primary/20 hover:border-primary/40 transition-colors ${
                      isActive ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {d.label}
                  </Badge>
                </Link>
              )
            })}
          </div>

          {/* Month filter */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground w-20">
              <Calendar className="h-4 w-4" />
              <span>Month:</span>
            </div>
            <Link href={buildUrl('month', null)}>
              <Badge
                variant="outline"
                className={`cursor-pointer hover:bg-primary/20 hover:border-primary/40 transition-colors ${
                  !params.month ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground'
                }`}
              >
                Any
              </Badge>
            </Link>
            {MONTHS.map((m, idx) => (
              <Link key={m} href={buildUrl('month', String(idx))}>
                <Badge
                  variant="outline"
                  className={`cursor-pointer hover:bg-primary/20 hover:border-primary/40 transition-colors ${
                    params.month === String(idx) ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground'
                  }`}
                >
                  {m}
                </Badge>
              </Link>
            ))}
          </div>

          {/* Active filters clear */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2">
              <Link href="/explore">
                <Button variant="outline" size="sm" className="border-border text-xs gap-1">
                  <X className="h-3 w-3" /> Clear all filters
                </Button>
              </Link>
              <span className="text-xs text-muted-foreground">{packages.length} trips found</span>
            </div>
          )}
        </div>

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
                <Card className="bg-card border-border overflow-hidden card-hover cursor-pointer h-full group">
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
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/80">
                      <MapPin className="h-3 w-3" />
                      {pkg.destination?.name}, {pkg.destination?.state}
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-white text-lg leading-tight mb-1">{pkg.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{pkg.short_description}</p>
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
