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
  const badge = primaryTripBadge({ pastEdition, spotsLeft, isFeatured: pkg.is_featured, isCommunity: Boolean(pkg.host_id || pkg.created_on_behalf_by) })
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
            className="object-cover transition-transform duration-300 md:group-hover:scale-[1.03] motion-reduce:transition-none" />
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
          className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full before:absolute before:inset-2 before:rounded-full before:bg-black/40 before:backdrop-blur-md before:transition-colors hover:before:bg-black/60 disabled:opacity-70 md:right-0.5 md:top-0.5 md:before:inset-1.5"
          aria-label={interested ? 'Remove from saved' : 'Save trip'}
          aria-pressed={interested}
        >
          <Heart className={cn('relative h-3.5 w-3.5 transition-transform md:h-4 md:w-4', interested ? 'fill-red-500 text-red-500' : 'text-white')} />
        </button>
      </ListingCardMedia>

      <div className="relative flex flex-1 flex-col p-2.5 md:p-3.5">
        <h3 className={cn('line-clamp-2 text-xs font-semibold leading-snug md:text-[15px] md:font-bold', pastEdition ? 'text-muted-foreground' : 'text-foreground')}>
          {pkg.title}
        </h3>
        <p className="mt-1 flex min-w-0 gap-1 text-[10px] leading-snug text-muted-foreground md:text-xs">
          {location ? <span className="truncate">{location}</span> : null}
          <span className="shrink-0">{location ? '· ' : ''}{compactTripDuration(pkg)}</span>
        </p>
        {dateLine ? (
          <p className={cn('mt-1 flex flex-wrap gap-x-1 text-[10px] font-medium leading-snug md:text-xs', pastEdition ? 'text-muted-foreground' : 'text-primary')}>
            <span>{dateLine}</span>
            {pkg.difficulty ? <span className="font-normal capitalize text-muted-foreground">· {pkg.difficulty}</span> : null}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-1 pt-2 md:gap-2 md:pt-3">
          <ListingCardPrice amount={formatPrice(pkg.price_paise)} suffix="person" from={tiered} muted={pastEdition} />
          {interestCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground md:gap-1 md:text-xs" title={`${interestCount} interested`}>
              <Heart className="h-2.5 w-2.5 fill-red-400 text-red-400 md:h-3 md:w-3" aria-hidden="true" />
              {interestCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
