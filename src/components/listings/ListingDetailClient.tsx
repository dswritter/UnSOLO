'use client'

import Image from 'next/image'
import { Star, MapPin, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ServiceListing, ServiceListingItem } from '@/types'
import { formatPrice } from '@/types'
import { ListingBookingForm } from './ListingBookingForm'
import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'

interface ListingDetailClientProps {
  listing: ServiceListing
  items?: ServiceListingItem[]
}

export function ListingDetailClient({ listing, items = [] }: ListingDetailClientProps) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.svg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  // When items exist, exactly one must be picked to book. Auto-select the
  // first item so the sidebar price/form has something to render; user can
  // switch via the carousel arrows or by clicking another card.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  )
  const selectedItem = items.find(i => i.id === selectedItemId) || null

  // ── Item carousel ───────────────────────────────────────────────────────
  // carouselIdx tracks which item card is "focused" in the carousel. It is
  // kept in sync with selectedItemId so arrow navigation and card clicks
  // both update the selection. A timer auto-advances every 5 s; any manual
  // interaction resets the timer to prevent fighting the user.
  const [carouselIdx, setCarouselIdx] = useState(0)
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goToIdx = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, items.length - 1))
    setCarouselIdx(clamped)
    if (items[clamped] && !items[clamped].quantity_available === false) {
      // Only auto-select non-sold-out items
      if (items[clamped].quantity_available > 0) {
        setSelectedItemId(items[clamped].id)
      }
    }
  }, [items])

  // Auto-advance
  useEffect(() => {
    if (items.length <= 1) return
    const tick = () => {
      setCarouselIdx(prev => {
        const next = (prev + 1) % items.length
        // keep selection in sync (skip sold-out)
        if (items[next]?.quantity_available > 0) setSelectedItemId(items[next].id)
        return next
      })
    }
    autoAdvanceRef.current = setTimeout(tick, 5000)
    return () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current) }
  }, [carouselIdx, items])

  // When user manually clicks a card, sync carouselIdx to it and reset timer
  const handleItemSelect = useCallback((itemId: string) => {
    const idx = items.findIndex(i => i.id === itemId)
    if (idx !== -1) {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
      setCarouselIdx(idx)
      setSelectedItemId(itemId)
    }
  }, [items])

  const displayPricePaise = selectedItem?.price_paise ?? listing.price_paise
  const displayAvailable = selectedItem
    ? selectedItem.quantity_available
    : listing.quantity_available
  const isRental = listing.type === 'rentals'
  const displayUnit = (isRental && selectedItem?.unit) || listing.unit

  // Type-specific metadata display
  const getMetadataDisplay = () => {
    const m = listing.metadata || {}
    switch (listing.type) {
      case 'stays':
        return [
          `${m.num_rooms || '?'} rooms`,
          `${m.num_bathrooms || '?'} bathrooms`,
          m.check_in_time && `Check-in: ${m.check_in_time}`,
        ].filter(Boolean)
      case 'activities':
        return [
          `${m.duration_hours || '?'} hours`,
          m.difficulty && `Difficulty: ${m.difficulty}`,
          m.guide_included && 'Guide included',
        ].filter(Boolean)
      case 'rentals':
        return [
          m.vehicle_type && `Type: ${m.vehicle_type}`,
          m.mileage_limit_km && `${m.mileage_limit_km}km limit`,
          m.transmission && `Transmission: ${m.transmission}`,
        ].filter(Boolean)
      case 'getting_around':
        return [
          m.transport_type && `Transport: ${m.transport_type}`,
          m.capacity_persons && `${m.capacity_persons} seats`,
        ].filter(Boolean)
      default:
        return []
    }
  }

  const metadataDisplay = getMetadataDisplay()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-8">
        {/* Hero image — click to expand full image */}
        <ImageLightbox src={imageUrl} alt={listing.title} className="relative aspect-video rounded-xl overflow-hidden bg-zinc-100">
          <Image
            src={imageUrl}
            alt={listing.title}
            fill
            className="object-cover"
            priority
          />
        </ImageLightbox>

        {/* Title & location */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{listing.title}</h1>
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <MapPin className="h-4 w-4" />
            <span>{listing.location}</span>
          </div>
          {listing.short_description && (
            <p className="text-lg text-muted-foreground">{listing.short_description}</p>
          )}
        </div>

        {/* Rating & reviews */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="font-bold text-lg">{ratingDisplay}</span>
            {listing.review_count > 0 && (
              <span className="text-muted-foreground">({listing.review_count} reviews)</span>
            )}
          </div>
        </div>

        {/* Metadata */}
        {metadataDisplay.length > 0 && (
          <div className="bg-secondary/50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              {metadataDisplay.map((item, idx) => (
                <div key={idx} className="text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Amenities (master level — hidden for rentals since they live per-item) */}
        {!isRental && listing.amenities && listing.amenities.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Amenities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {listing.amenities.map((amenity) => (
                <div key={amenity} className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-primary" />
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {listing.description && (
          <div>
            <h2 className="text-xl font-bold mb-4">About</h2>
            <div className="text-muted-foreground whitespace-pre-wrap">
              {listing.description}
            </div>
          </div>
        )}

        {/* Items picker — horizontal carousel with auto-scroll + arrow nav */}
        {items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">Choose an option</h2>
              {items.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  {carouselIdx + 1} / {items.length}
                </span>
              )}
            </div>

            <div className="relative">
              {/* Left arrow */}
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="Previous item"
                  onClick={() => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); goToIdx(carouselIdx - 1) }}
                  disabled={carouselIdx === 0}
                  className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-secondary disabled:opacity-30 transition-opacity"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}

              {/* Carousel track — shows current card + peek of neighbours */}
              <div className="overflow-hidden rounded-xl mx-4">
                <div
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${carouselIdx * 100}%)` }}
                >
                  {items.map((item, idx) => {
                    const isSelected = item.id === selectedItemId
                    const soldOut = item.quantity_available === 0
                    return (
                      <div key={item.id} className="w-full flex-shrink-0 px-1">
                        <button
                          type="button"
                          onClick={() => !soldOut && handleItemSelect(item.id)}
                          disabled={soldOut}
                          className={`w-full text-left rounded-xl border bg-card p-3 transition-all ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-border hover:border-primary/40'
                          } ${soldOut ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex gap-3">
                            {item.images[0] ? (
                              <ImageLightbox
                                src={item.images[0]}
                                alt={item.name}
                                className="flex-shrink-0"
                              >
                                <Image
                                  src={item.images[0]}
                                  alt={item.name}
                                  width={96}
                                  height={96}
                                  className="h-24 w-24 rounded-lg object-cover"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </ImageLightbox>
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{item.name}</div>
                              <div className="text-sm font-bold text-primary mt-0.5">
                                {formatPrice(item.price_paise)}
                                {isRental && item.unit ? ` / ${item.unit.replace('per_', '').replace('_', ' ')}` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {soldOut ? (
                                  <span className="text-red-500">Sold out</span>
                                ) : (
                                  <span className="text-green-600">{item.quantity_available} available</span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                              {isRental && item.amenities && item.amenities.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {item.amenities.map(a => (
                                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right arrow */}
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="Next item"
                  onClick={() => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); goToIdx(carouselIdx + 1) }}
                  disabled={carouselIdx === items.length - 1}
                  className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-secondary disabled:opacity-30 transition-opacity"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}

              {/* Dot indicators */}
              {items.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-3">
                  {items.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Go to item ${idx + 1}`}
                      onClick={() => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); goToIdx(idx) }}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === carouselIdx ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <span key={tag} className="inline-block bg-primary/10 text-primary text-sm px-3 py-1 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar - Booking form */}
      <div className="lg:col-span-1">
        <div className="sticky top-6 rounded-xl border border-border bg-card p-6 space-y-4">
          {/* Price — shows selected item's price if items exist, otherwise
              master listing price. Never shows a stale master price when
              individual items have their own pricing. */}
          <div>
            {items.length > 0 ? (
              selectedItem ? (
                <>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {selectedItem.name}
                  </div>
                  <div className="text-3xl font-bold text-primary mb-1">
                    {formatPrice(selectedItem.price_paise)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    per {displayUnit.replace('per_', '').replace('_', ' ')}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an option to see pricing
                </p>
              )
            ) : (
              <>
                <div className="text-3xl font-bold text-primary mb-1">
                  {formatPrice(listing.price_paise)}
                </div>
                <div className="text-sm text-muted-foreground">
                  per {listing.unit.replace('per_', '').replace('_', ' ')}
                </div>
              </>
            )}
          </div>

          {/* Availability */}
          {displayAvailable != null && (
            <div className="text-sm">
              <span className={displayAvailable > 0 ? 'text-green-600' : 'text-red-600'}>
                {displayAvailable > 0
                  ? `${displayAvailable} available`
                  : 'Sold out'}
              </span>
            </div>
          )}

          {/* Booking form */}
          <div className="border-t border-border pt-4">
            <Suspense fallback={<div className="h-64 bg-secondary/50 rounded-lg animate-pulse" />}>
              <ListingBookingForm listing={listing} selectedItem={selectedItem} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
