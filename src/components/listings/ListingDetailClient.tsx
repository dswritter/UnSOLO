'use client'

import Image from 'next/image'
import { Star, MapPin, Zap } from 'lucide-react'
import type { ServiceListing, ServiceListingItem } from '@/types'
import { formatPrice } from '@/types'
import { ListingBookingForm } from './ListingBookingForm'
import { Suspense, useState } from 'react'

interface ListingDetailClientProps {
  listing: ServiceListing
  items?: ServiceListingItem[]
}

export function ListingDetailClient({ listing, items = [] }: ListingDetailClientProps) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.jpg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  // When items exist, exactly one must be picked to book. Auto-select the
  // first item so the sidebar price/form has something to render; user can
  // switch by clicking another card.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  )
  const selectedItem = items.find(i => i.id === selectedItemId) || null

  const displayPricePaise = selectedItem?.price_paise ?? listing.price_paise
  const displayAvailable = selectedItem
    ? selectedItem.quantity_available
    : listing.quantity_available

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
        {/* Hero image */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-100">
          <Image
            src={imageUrl}
            alt={listing.title}
            fill
            className="object-cover"
            priority
          />
        </div>

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

        {/* Amenities */}
        {listing.amenities && listing.amenities.length > 0 && (
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

        {/* Items picker */}
        {items.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Choose an option</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => {
                const isSelected = item.id === selectedItemId
                const soldOut = item.quantity_available === 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !soldOut && setSelectedItemId(item.id)}
                    disabled={soldOut}
                    className={`text-left rounded-xl border bg-card p-3 transition-colors ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/40'
                    } ${soldOut ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex gap-3">
                      {item.images[0] && (
                        <Image
                          src={item.images[0]}
                          alt={item.name}
                          width={80}
                          height={80}
                          className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatPrice(item.price_paise)} · {soldOut ? 'Sold out' : `${item.quantity_available} left`}
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
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
          {/* Price */}
          <div>
            {selectedItem && (
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                {selectedItem.name}
              </div>
            )}
            <div className="text-3xl font-bold text-primary mb-1">
              {formatPrice(displayPricePaise)}
            </div>
            <div className="text-sm text-muted-foreground">
              per {listing.unit.replace('_', ' ')}
            </div>
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
