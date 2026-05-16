'use client'

import Image from 'next/image'
import type { Package } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Mountain, Star, ShieldCheck, Heart } from 'lucide-react'
import { formatPrice, cn } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { packageDurationShortLabel, packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'

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

export interface ExploreTripPackageCardProps {
  pkg: Package
  /** Dates are all in the past (no open upcoming departure): muted visuals + footer section */
  pastEdition: boolean
  spotsBooked: number
  interestTotal: number
  wishlistedIds: boolean
  hasPublishedInterest: boolean
  onOpenDetail: () => void
  onPrefetch: () => void
  onToggleWishlist: (id: string) => void
}

export function ExploreTripPackageCard({
  pkg,
  pastEdition,
  spotsBooked,
  interestTotal,
  wishlistedIds,
  hasPublishedInterest,
  onOpenDetail,
  onPrefetch,
  onToggleWishlist,
}: ExploreTripPackageCardProps) {
  const spotsLeft = pkg.max_group_size - spotsBooked
  const nextDeparture = packageNextDepartureLine(pkg)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail()
        }
      }}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn('cursor-pointer', pastEdition && 'opacity-90')}
    >
      <Card
        className={cn(
          'bg-card border-border overflow-hidden cursor-pointer h-full group py-0 gap-0',
          'transition-all duration-300 hover:shadow-xl hover:scale-[1.02]',
          'motion-reduce:transition-none motion-reduce:hover:scale-100',
          'hover:bg-gradient-to-br hover:from-card hover:to-secondary/50',
          pkg.host_id ? 'ring-2 ring-blue-500/50 bg-gradient-to-br from-card to-blue-500/5' : '',
          pastEdition &&
            cn(
              'border-dashed border-border/65 bg-muted/15 shadow-none',
              'saturate-[0.92] grayscale-[15%]',
              'hover:saturate-100 hover:grayscale-[5%]',
            ),
          pastEdition && 'hover:scale-[1.01] hover:opacity-95',
        )}
      >
        <div className="relative h-52 bg-secondary overflow-hidden shrink-0 rounded-t-xl">
          {pkg.images?.[0] ? (
            <Image
              src={storageThumbnailUrl(pkg.images[0]) || pkg.images[0]}
              alt={pkg.title}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className={cn(
                'object-cover transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
                pastEdition ? 'brightness-[0.88] saturate-[0.9] group-hover:scale-[1.02]' : 'group-hover:scale-105',
              )}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
              <Mountain className={cn('h-14 w-14', pastEdition ? 'text-muted-foreground/40' : 'text-primary/30')} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute top-3 left-3 flex gap-2 flex-wrap items-start">
            {pastEdition ? (
              <Badge className="text-[10px] border bg-black/55 text-white/95 border-white/25 backdrop-blur-md">
                Past trip
              </Badge>
            ) : null}
            <Badge className={`text-xs ${DIFFICULTY_COLORS[pkg.difficulty]}`}>
              {DIFFICULTY_ICONS[pkg.difficulty] || ''} {pkg.difficulty}
            </Badge>
            {pkg.is_featured && (
              <Badge className={cn('text-xs border-none', pastEdition ? 'bg-amber-500/70 text-black' : 'bg-primary/90 text-black')}>
                Featured
              </Badge>
            )}
            {pkg.host_id && (
              <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">Community</Badge>
            )}
            {!pastEdition && spotsLeft > 0 && spotsLeft <= 5 && (
              <Badge className="text-xs bg-red-500/80 text-white border-none">Only {spotsLeft} left!</Badge>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleWishlist(pkg.id)
            }}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-all z-10 backdrop-blur-sm"
            aria-label="Add to wishlist"
          >
            <Heart
              className={cn(
                'h-5 w-5 transition-all duration-300',
                wishlistedIds || hasPublishedInterest ? 'fill-red-500 text-red-500 scale-110' : 'text-white/80 hover:text-white',
              )}
            />
          </button>
          <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/80">
            <MapPin className="h-3 w-3" />
            {pkg.destination?.name}, {pkg.destination?.state}
          </div>

          {pkg.host_id && pkg.host && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1 pr-2.5 py-1">
              {pkg.host.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={storageThumbnailUrl(pkg.host.avatar_url) || pkg.host.avatar_url}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover"
                />
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
          <h3 className={cn('font-bold text-lg leading-tight mb-1', pastEdition ? 'text-muted-foreground' : 'text-foreground')}>
            {pkg.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{pkg.short_description}</p>

          {pkg.host_id && pkg.host && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
              {pkg.host.host_rating != null && pkg.host.host_rating > 0 && (
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  <span>{pkg.host.host_rating.toFixed(1)}</span>
                </div>
              )}
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
              <span
                className={cn(
                  'font-black text-xl',
                  pastEdition ? 'text-muted-foreground font-bold' : 'text-primary font-black',
                )}
              >
                {hasTieredPricing(pkg.price_variants) ? 'Starting from ' : ''}
                {formatPrice(pkg.price_paise)}
              </span>
              <span className="text-muted-foreground text-xs ml-1">/ person</span>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-xs font-semibold tabular-nums text-foreground">{packageDurationShortLabel(pkg)}</div>
              {nextDeparture ? (
                <div className={cn('text-[11px] font-medium leading-tight', pastEdition ? 'text-muted-foreground' : 'text-primary')}>
                  {nextDeparture}
                </div>
              ) : null}
              <div className="text-[11px] text-muted-foreground">Max {pkg.max_group_size} people</div>
            </div>
          </div>
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
}
