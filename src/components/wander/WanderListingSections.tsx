import Link from 'next/link'
import Image from 'next/image'
import type { Package, ServiceListing } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, cn } from '@/lib/utils'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import { ServiceListingCard } from '@/components/explore/ServiceListingCard'
import { MapPin, Mountain, ChevronRight } from 'lucide-react'

const DIFF: Record<string, string> = {
  easy: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  moderate: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  challenging: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
}

type ActivityWithItems = ServiceListing & {
  items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
}
type RentalWithItems = ActivityWithItems

function TripCard({ pkg }: { pkg: Package }) {
  return (
    <Link href={`/packages/${pkg.slug}`} className="block h-full" target="_blank" rel="noopener noreferrer">
      <Card
        className={cn(
          'h-full overflow-hidden border-border/80 bg-card/80 py-0 gap-0 transition-all hover:shadow-lg hover:scale-[1.01]',
          pkg.is_featured && 'ring-1 ring-primary/30',
        )}
      >
        <div className="relative h-48 bg-secondary overflow-hidden">
          {pkg.images?.[0] ? (
            <Image src={pkg.images[0]} alt="" fill className="object-cover" sizes="(min-width: 1024px) 25vw, 100vw" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Mountain className="h-12 w-12 text-primary/30" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {pkg.is_featured ? (
              <Badge className="text-[10px] bg-primary text-primary-foreground border-0">Featured</Badge>
            ) : null}
            <Badge variant="outline" className={cn('text-[10px] capitalize border', DIFF[pkg.difficulty] || '')}>
              {pkg.difficulty}
            </Badge>
          </div>
        </div>
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-bold line-clamp-2 text-sm sm:text-base leading-snug mb-1">{pkg.title}</h3>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="h-3 w-3 shrink-0" />
            {pkg.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '—'}
          </p>
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="text-primary font-black text-base sm:text-lg">
                {hasTieredPricing(pkg.price_variants) ? 'From ' : ''}
                {formatPrice(pkg.price_paise)}
              </span>
              <span className="text-[10px] text-muted-foreground"> / person</span>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <div>{packageDurationShortLabel(pkg)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function SectionHeader({
  title,
  actionHref,
  actionLabel = 'View all',
}: {
  title: string
  actionHref: string
  actionLabel?: string
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <h2 className="text-xl md:text-2xl font-black tracking-tight">{title}</h2>
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline shrink-0"
      >
        {actionLabel} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

export function WanderListingSections({
  trips,
  activities,
  rentals,
}: {
  trips: Package[]
  activities: ActivityWithItems[]
  rentals: RentalWithItems[]
}) {
  return (
    <div className="space-y-12 md:space-y-16">
      <section>
        <SectionHeader title="Popular trips" actionHref="/explore?tab=trips" actionLabel="View all trips" />
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trips.map(p => (
              <TripCard key={p.id} pkg={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Popular activities" actionHref="/explore?tab=activities" />
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activities to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activities.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Frequently booked rentals" actionHref="/explore?tab=rentals" />
        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rentals.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
