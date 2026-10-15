'use client'

import Image from 'next/image'
import { Heart, Mountain } from 'lucide-react'
import type { Package } from '@/types'
import { cn, formatPrice } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { hasTieredPricing } from '@/lib/package-pricing'
import { packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { compactTripDuration, primaryTripBadge, shortListingLocation } from '@/lib/listing-card-format'
import { writeDetailPreview } from '@/lib/detail-preview'
import { ListingCardBadge, ListingCardMedia, ListingCardPrice, listingCardShellClass } from '@/components/listings/ListingCardParts'

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
  const badge = primaryTripBadge({ pastEdition, spotsLeft, isFeatured: pkg.is_featured, isCommunity: Boolean(pkg.host_id) })
  const departure = packageNextDepartureLine(pkg)
  const dateLine = pastEdition
    ? departure?.replace(/^Last departure /, 'Last ran ')
    : departure?.replace(/^Next · /, 'Next: ')
  const location = shortListingLocation(null, pkg.destination)
  const image = pkg.images?.[0]
  const imageUrl = image ? storageThumbnailUrl(image) || image : null
  const tiered = hasTieredPricing(pkg.price_variants)
  const open = () => {
    writeDetailPreview(`/packages/${pkg.slug}`, {
      title: pkg.title, image: imageUrl, imageSizes, location,
      meta: [compactTripDuration(pkg), pkg.difficulty, dateLine].filter((v): v is string => Boolean(v)),
      price: formatPrice(pkg.price_paise), priceSuffix: 'person', priceFrom: tiered,
    })
    onOpen()
  }

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
      className={listingCardShellClass(pastEdition)}
    >
      <ListingCardMedia muted={pastEdition}>
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes={imageSizes}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <div className="relative flex h-full items-center justify-center"><Mountain className="h-12 w-12 text-primary/30" /></div>
        )}
        <ListingCardBadge badge={badge} />
        <button
          type="button"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onToggleInterest()
          }}
          disabled={togglePending}
          className="absolute right-2.5 top-2.5 z-10 rounded-full bg-black/40 p-2 backdrop-blur-md transition-colors hover:bg-black/60 disabled:opacity-70"
          aria-label={interested ? 'Remove from saved' : 'Save trip'}
          aria-pressed={interested}
        >
          <Heart className={cn('h-4 w-4 transition-transform', interested ? 'scale-110 fill-red-500 text-red-500' : 'text-white')} />
        </button>
      </ListingCardMedia>

      <div className="relative flex flex-1 flex-col p-3.5">
        <h3 className={cn('line-clamp-2 text-[15px] font-bold leading-snug', pastEdition ? 'text-muted-foreground' : 'text-foreground')}>
          {pkg.title}
        </h3>
        <p className="mt-1 flex min-w-0 gap-1 text-xs text-muted-foreground">
          {location ? <span className="truncate">{location}</span> : null}
          <span className="shrink-0">{location ? '· ' : ''}{compactTripDuration(pkg)}</span>
        </p>
        {dateLine ? (
          <p className={cn('mt-1 text-xs font-medium', pastEdition ? 'text-muted-foreground' : 'text-primary')}>
            {dateLine}
            {pkg.difficulty ? <span className="font-normal capitalize text-muted-foreground"> · {pkg.difficulty}</span> : null}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <ListingCardPrice amount={formatPrice(pkg.price_paise)} suffix="person" from={tiered} muted={pastEdition} />
          {interestCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={`${interestCount} interested`}>
              <Heart className="h-3 w-3 fill-red-400 text-red-400" aria-hidden="true" />
              {interestCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
