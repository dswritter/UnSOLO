'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import type { ServiceListing } from '@/types'
import { cn, formatPrice } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { pushWithRouteProgress } from '@/lib/navigation/pushWithRouteProgress'
import { shortListingLocation, unitShortLabel } from '@/lib/listing-card-format'
import { writeDetailPreview } from '@/lib/detail-preview'
import { ListingCardBadge, ListingCardMedia, ListingCardPrice, listingCardShellClass } from '@/components/listings/ListingCardParts'

type CardItem = {
  id: string
  name: string
  price_paise: number
  images: string[]
  unit: string | null
  is_out_of_stock?: boolean
}

interface ServiceListingCardProps {
  listing: ServiceListing
  items?: CardItem[]
  /** Dated listings with no upcoming schedule — subdued treatment. */
  muted?: boolean
}

const MAX_DOTS = 5
const CARD_IMAGE_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 80vw'

function listingDetailLine(listing: ServiceListing): string {
  const m = listing.metadata || {}
  switch (listing.type) {
    case 'stays':
      return m.num_rooms ? `${m.num_rooms} room${Number(m.num_rooms) === 1 ? '' : 's'}` : ''
    case 'activities':
      return m.duration_hours ? `${m.duration_hours}h` : ''
    case 'rentals':
      return typeof m.vehicle_type === 'string' ? m.vehicle_type : ''
    case 'getting_around':
      return typeof m.transport_type === 'string' ? m.transport_type : ''
    default:
      return ''
  }
}

function imageSrc(raw: string | null | undefined) {
  return raw ? (storageThumbnailUrl(raw) || raw) : '/placeholder-listing.svg'
}

export function ServiceListingCard({ listing, items, muted = false }: ServiceListingCardProps) {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [idx, setIdx] = useState(0)
  const slides = (items || []).filter(item => item.images.length > 0)
  const hasCarousel = slides.length >= 2
  const active = hasCarousel ? slides[idx % slides.length] : null
  const href = `/listings/${listing.type}/${listing.slug}`

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i + delta + slides.length) % slides.length)
  }

  const location = shortListingLocation(listing.location, listing.destination)
  const detail = listingDetailLine(listing)
  const optionCount = items?.length ?? 0
  const rating = listing.average_rating > 0 ? listing.average_rating.toFixed(1) : null
  const coverRaw = listing.images?.[0]
  const coverUrl = coverRaw ? storageThumbnailUrl(coverRaw) || coverRaw : null

  const openDetail = () => {
    writeDetailPreview(href, {
      title: listing.title, image: coverUrl, imageSizes: CARD_IMAGE_SIZES, location,
      meta: [detail, optionCount > 1 ? `${optionCount} options` : ''].filter(Boolean),
      price: formatPrice(listing.price_paise), priceSuffix: unitShortLabel(listing.unit), priceFrom: true,
    })
    if (isMobile) {
      pushWithRouteProgress(router, href)
      return
    }
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={listing.title}
      onClick={openDetail}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDetail()
        }
      }}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      className={listingCardShellClass(muted)}
    >
      <ListingCardMedia muted={muted}>
        <Image
          src={imageSrc(active?.images[0] || listing.images?.[0])}
          alt={active?.name || listing.title}
          fill
          sizes={CARD_IMAGE_SIZES}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <ListingCardBadge badge={muted ? { label: 'Past', tone: 'past' } : listing.is_featured ? { label: 'Featured', tone: 'featured' } : null} />
        {active ? (
          <>
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
            <p className="absolute bottom-2 left-3 right-16 z-10 truncate text-xs font-medium text-white">
              {active.name}{active.is_out_of_stock ? <span className="text-amber-300"> · Sold out</span> : null}
            </p>
            <div className="absolute bottom-2.5 right-3 z-10 flex items-center gap-1">
              {slides.length <= MAX_DOTS
                ? slides.map((slide, i) => (
                    <span key={slide.id} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/50')} />
                  ))
                : <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{idx + 1}/{slides.length}</span>}
            </div>
            <button type="button" onClick={step(-1)} aria-label="Previous option"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={step(1)} aria-label="Next option"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </ListingCardMedia>

      <div className="relative flex flex-1 flex-col p-3.5">
        <h3 className={cn('line-clamp-2 text-[15px] font-bold leading-snug', muted ? 'text-muted-foreground' : 'text-foreground')}>
          {listing.title}
        </h3>
        {location || detail ? (
          <p className="mt-1 flex min-w-0 gap-1 text-xs text-muted-foreground">
            {location ? <span className="truncate">{location}</span> : null}
            {detail ? <span className="shrink-0 capitalize">{location ? '· ' : ''}{detail}</span> : null}
          </p>
        ) : null}
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
          {rating ? <span className="font-medium text-foreground">{rating}</span> : <span>New</span>}
          {rating && listing.review_count > 0 ? <span>({listing.review_count})</span> : null}
          {optionCount > 1 ? <span>· {optionCount} options</span> : null}
        </p>
        <div className="mt-auto pt-3">
          <ListingCardPrice amount={formatPrice(listing.price_paise)} suffix={unitShortLabel(listing.unit)} from muted={muted} />
        </div>
      </div>
    </div>
  )
}
