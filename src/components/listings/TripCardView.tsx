'use client'

import Image from 'next/image'
import { Heart, Mountain } from 'lucide-react'
import type { Package } from '@/types'
import { cn, formatPrice } from '@/lib/utils'
import { isOptimizableImageUrl } from '@/lib/images/isOptimizableImageUrl'
import { LowResUnderlay } from '@/components/ui/LowResUnderlay'
import { hasTieredPricing } from '@/lib/package-pricing'
import { packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { compactTripDuration, primaryTripBadge, shortListingLocation } from '@/lib/listing-card-format'
import { writeDetailPreview } from '@/lib/detail-preview'
import { ListingCardBadge } from '@/components/listings/ListingCardParts'
import { SeatRing, segsFromCounts, spotsCenter } from '@/components/tribe/SeatRing'
import { nextDeparture } from '@/lib/tribe/models'

export type TripCardViewProps = {
  pkg: Package
  pastEdition: boolean
  spotsBooked: number
  interestCount: number
  interested: boolean
  togglePending?: boolean
  imageSizes: string
  onOpen: () => void
  onPrefetch?: () => void
  onToggleInterest: () => void
}

export function TripCardView({
  pkg, pastEdition, spotsBooked, interestCount, interested, togglePending = false, imageSizes, onOpen, onPrefetch, onToggleInterest,
}: TripCardViewProps) {
  const spotsLeft = pkg.max_group_size ? pkg.max_group_size - spotsBooked : null
  const badge = primaryTripBadge({ pastEdition, spotsLeft, isFeatured: pkg.is_featured, isCommunity: Boolean(pkg.host_id || pkg.created_on_behalf_by) })
  const departure = packageNextDepartureLine(pkg)
  const dateLine = pastEdition
    ? departure?.replace(/^Last departure /, 'Last ran ')
    : departure?.replace(/^Next · /, 'Next: ')
  const location = shortListingLocation(null, pkg.destination)
  const image = pkg.images?.[0]
  // Full photo, resized by next/image; its 320px thumb paints first (LowResUnderlay).
  const imageUrl = image || null
  const tiered = hasTieredPricing(pkg.price_variants)
  const open = () => {
    writeDetailPreview(`/packages/${pkg.slug}`, {
      title: pkg.title, image: imageUrl, imageSizes, location,
      meta: [compactTripDuration(pkg), pkg.difficulty, dateLine].filter((v): v is string => Boolean(v)),
      price: formatPrice(pkg.price_paise), priceSuffix: 'person', priceFrom: tiered,
    })
    onOpen()
  }

  const total = pkg.max_group_size || 0
  const left = Math.max(spotsLeft ?? total, 0)
  const showRing = !pastEdition && total > 0
  const full = showRing && left === 0
  const next = nextDeparture(pkg.departure_dates)
  const day = next ? new Date(`${next}T00:00:00Z`) : null

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={pkg.title}
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn('fc-tcard group h-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pc-ink)]', pastEdition && 'opacity-80 saturate-[0.85] hover:opacity-100')}
    >
      {/* Full Circle card: photo first, the seat ring overlapping its bottom edge (upcoming trips). */}
      <div className="fc-tcard-photo !h-auto aspect-video">
        {imageUrl ? (
          <>
            <LowResUnderlay src={imageUrl} />
            <Image src={imageUrl} alt="" fill sizes={imageSizes} unoptimized={!isOptimizableImageUrl(imageUrl)} className="object-cover" />
          </>
        ) : (
          <div className="relative flex h-full items-center justify-center"><Mountain className="h-12 w-12 text-muted-foreground/40" /></div>
        )}
        {day && !pastEdition && (
          <span className="fc-datechip"><b>{day.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'UTC' })}</b><span>{day.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span></span>
        )}
        {badge && (pastEdition || badge.tone !== 'urgent') ? <ListingCardBadge badge={day && !pastEdition ? null : badge} /> : null}
        <button
          type="button"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onToggleInterest()
          }}
          disabled={togglePending}
          className="pc-glassbtn absolute right-3 top-3 z-10 disabled:opacity-70"
          aria-label={interested ? 'Remove from saved' : 'Save trip'}
          aria-pressed={interested}
        >
          <Heart className={cn('h-[18px] w-[18px]', interested ? 'fill-red-500 text-red-500' : '')} aria-hidden />
        </button>
      </div>

      <div className={cn('fc-tcard-main', !showRing && 'mt-0 pt-3')}>
        {showRing && (
          <SeatRing segs={segsFromCounts(total, left)} size={84} showDots={false} className="fc-tcard-ring"
            center={spotsCenter(total, left, 23)} />
        )}
        <div className={cn('min-w-0 flex-1', showRing && 'pt-11')}>
          <h3 className={cn('line-clamp-2 text-[17px] leading-tight', pastEdition && 'text-muted-foreground')}>{pkg.title}</h3>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{compactTripDuration(pkg)}{location ? ` · ${location}` : ''}</p>
        </div>
      </div>
      <div className="mt-auto px-4 pb-4 pt-2.5">
        {dateLine && pastEdition ? <p className="mb-1.5 text-[12.5px] text-muted-foreground">{dateLine}{pkg.difficulty ? ` · ${pkg.difficulty}` : ''}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <span className="pc-price text-[18px]">{tiered ? <small className="!ml-0 mr-1">From</small> : null}{formatPrice(pkg.price_paise)}<small>/person</small></span>
          {showRing ? (
            <span className="fc-caption shrink-0 text-[12.5px]">{full ? <strong>Full</strong> : spotsBooked > 0 ? <><strong>{spotsBooked} going</strong></> : <strong>Be first</strong>}</span>
          ) : interestCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground" title={`${interestCount} interested`}>
              <Heart className="h-3 w-3 fill-red-400 text-red-400" aria-hidden="true" />{interestCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
