'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ServiceListing } from '@/types'
import { formatPrice, cn } from '@/lib/utils'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'

type CardItem = {
  id: string
  name: string
  price_paise: number
  images: string[]
  unit: string | null
}

interface ServiceListingCardProps {
  listing: ServiceListing
  items?: CardItem[]
}

// ── Single-image fallback card (no items or just one) ─────────────────────
function PlainCard({ listing }: { listing: ServiceListing }) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.svg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  const getMetadataDisplay = () => {
    const m = listing.metadata || {}
    const parts: string[] = []
    switch (listing.type) {
      case 'stays':
        if (m.num_rooms) parts.push(`${m.num_rooms} rooms`)
        if (m.num_bathrooms) parts.push(`${m.num_bathrooms} baths`)
        break
      case 'activities':
        if (m.duration_hours) parts.push(`${m.duration_hours}h`)
        if (m.difficulty) parts.push(m.difficulty as string)
        break
      case 'rentals':
        if (m.vehicle_type) parts.push(m.vehicle_type as string)
        if (m.mileage_limit_km) parts.push(`${m.mileage_limit_km} km limit`)
        break
      case 'getting_around':
        if (m.transport_type) parts.push(m.transport_type as string)
        if (m.capacity_persons) parts.push(`${m.capacity_persons} seats`)
        break
    }
    return parts.join(' • ')
  }

  return (
    <Link href={`/listings/${listing.type}/${listing.slug}`} target="_blank" rel="noopener noreferrer">
      <div className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-all duration-300',
        'hover:shadow-xl hover:scale-[1.02]',
        'hover:bg-gradient-to-br hover:from-card hover:to-secondary/50',
        'border-border dark:border-border'
      )}>
        <div className="relative aspect-square overflow-hidden bg-secondary">
          <Image
            src={imageUrl}
            alt={listing.title}
            fill
            className="object-cover transition-transform group-hover:scale-110"
          />
          {listing.is_featured && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-semibold px-2 py-1 rounded">
              Featured
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          <div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-2">{listing.title}</h3>
            <p className="text-xs text-muted-foreground">{listing.location}</p>
          </div>
          <p className="text-xs text-muted-foreground">{getMetadataDisplay()}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-muted-foreground">From</span>
            <span className="text-lg font-bold text-foreground">{formatPrice(listing.price_paise)}</span>
            <span className="text-xs text-muted-foreground">/ {listing.unit.replace('_', ' ')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-medium text-foreground">{ratingDisplay}</span>
            {listing.review_count > 0 && (
              <span className="text-xs text-muted-foreground">({listing.review_count})</span>
            )}
          </div>
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {listing.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="inline-block bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
              {listing.tags.length > 2 && (
                <span className="text-xs text-muted-foreground px-2 py-1">+{listing.tags.length - 2}</span>
              )}
            </div>
          )}
          <button className="w-full mt-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 transition-colors">
            View Details
          </button>
        </div>
      </div>
    </Link>
  )
}

// ── Items carousel card ────────────────────────────────────────────────────
// NOTE: This card intentionally does NOT use <Link> as a wrapper.
// Nesting <button> elements inside <a> is invalid HTML — browsers collapse
// the structure and the inner buttons end up triggering navigation regardless
// of stopPropagation. We use window.open() on the card body instead so the
// detail page opens in a new tab.
function ItemsCarouselCard({ listing, items }: { listing: ServiceListing; items: CardItem[] }) {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIdx((i) => (i + 1) % items.length)
    }, 4000)
  }, [items.length])

  useEffect(() => {
    resetTimer()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [idx, resetTimer])

  const goTo = useCallback((next: number) => {
    setIdx(next)
    resetTimer()
  }, [resetTimer])

  const prev = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    goTo((idx - 1 + items.length) % items.length)
  }, [idx, items.length, goTo])

  const next = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    goTo((idx + 1) % items.length)
  }, [idx, items.length, goTo])

  const activeItem = items[idx]
  const heroImage = activeItem.images[0] || listing.images?.[0] || '/placeholder-listing.svg'

  const href = `/listings/${listing.type}/${listing.slug}`
  const openInNewTab = () => window.open(href, '_blank', 'noopener,noreferrer')

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openInNewTab}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openInNewTab() }}
      className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-all duration-300',
        'hover:shadow-xl hover:scale-[1.02]',
        'border-border dark:border-border cursor-pointer'
      )}
    >
      {/* ── Hero image with overlay info ──────────────────────────────── */}
      <div className="relative h-52 overflow-hidden bg-secondary">
          <Image
            src={heroImage}
            alt={activeItem.name}
            fill
            className="object-cover transition-all duration-500"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />

          {listing.is_featured && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-semibold px-2 py-1 rounded">
              Featured
            </div>
          )}

          {/* Prev / Next arrows — visible on hover */}
          {items.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-10"
                aria-label="Previous item"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-10"
                aria-label="Next item"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Active item name + price overlay (bottom of image) */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-6">
            <p className="text-white font-semibold text-sm leading-tight line-clamp-1">{activeItem.name}</p>
            <p className="text-white/80 text-xs mt-0.5">
              From {formatPrice(activeItem.price_paise)}
              {activeItem.unit ? ` / ${activeItem.unit.replace('per_', '').replace('_', ' ')}` : ''}
            </p>
          </div>

          {/* Dot indicators */}
          {items.length > 1 && (
            <div className="absolute bottom-2 right-3 flex gap-1 z-10">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(i) }}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                  )}
                  aria-label={`Item ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Item thumbnail strip ──────────────────────────────────────── */}
        {items.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-0 scrollbar-hide">
            {items.map((item, i) => {
              const thumb = item.images[0] || '/placeholder-listing.svg'
              return (
                <button
                  key={item.id}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(i) }}
                  className={cn(
                    'flex-shrink-0 rounded overflow-hidden border-2 transition-all',
                    i === idx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-90'
                  )}
                >
                  <Image
                    src={thumb}
                    alt={item.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 object-cover"
                  />
                </button>
              )
            })}
          </div>
        )}

        {/* ── Card footer ───────────────────────────────────────────────── */}
        <div className="px-4 pt-2.5 pb-4 space-y-2">
          <div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-1">{listing.title}</h3>
            <p className="text-xs text-muted-foreground">{listing.location}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm font-medium text-foreground">{ratingDisplay}</span>
              {listing.review_count > 0 && (
                <span className="text-xs text-muted-foreground">({listing.review_count})</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{items.length} option{items.length !== 1 ? 's' : ''}</span>
          </div>

          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {listing.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="inline-block bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
              {listing.tags.length > 2 && (
                <span className="text-xs text-muted-foreground px-1">+{listing.tags.length - 2}</span>
              )}
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); openInNewTab() }}
            className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 transition-colors"
          >
            View Details
          </button>
        </div>
    </div>
  )
}

// ── Public export ──────────────────────────────────────────────────────────
export function ServiceListingCard({ listing, items }: ServiceListingCardProps) {
  // Show carousel only when there are 2+ active items with at least one image
  const carouselItems = (items || []).filter((it) => it.images.length > 0)
  if (carouselItems.length >= 2) {
    return <ItemsCarouselCard listing={listing} items={carouselItems} />
  }
  return <PlainCard listing={listing} />
}
