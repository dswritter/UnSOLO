'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ServiceListing } from '@/types'
import { formatPrice } from '@/types'
import { Star } from 'lucide-react'

interface ServiceListingCardProps {
  listing: ServiceListing
}

export function ServiceListingCard({ listing }: ServiceListingCardProps) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.jpg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  // Type-specific display logic
  const getMetadataDisplay = () => {
    const m = listing.metadata || {}
    switch (listing.type) {
      case 'stays':
        return `${m.num_rooms || '?'} rooms • ${m.num_bathrooms || '?'} baths`
      case 'activities':
        return `${m.duration_hours || '?'}h • ${m.difficulty || 'varies'}`
      case 'rentals':
        return `${m.vehicle_type || 'Vehicle'} • ${m.mileage_limit_km || '∞'} km limit`
      case 'getting_around':
        return `${m.transport_type || 'Transport'} • ${m.capacity_persons || '?'} seats`
      default:
        return ''
    }
  }

  return (
    <Link href={`/listings/${listing.type}/${listing.slug}`}>
      <div className="group overflow-hidden rounded-lg border border-zinc-200 bg-white transition-all hover:shadow-lg">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-zinc-100">
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

        {/* Content */}
        <div className="p-4 space-y-2">
          {/* Title & Location */}
          <div>
            <h3 className="font-semibold text-sm text-zinc-900 line-clamp-2">{listing.title}</h3>
            <p className="text-xs text-zinc-500">{listing.location}</p>
          </div>

          {/* Metadata */}
          <p className="text-xs text-zinc-600">{getMetadataDisplay()}</p>

          {/* Price */}
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-zinc-900">{formatPrice(listing.price_paise)}</span>
            <span className="text-xs text-zinc-500">/ {listing.unit.replace('_', ' ')}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-medium text-zinc-900">{ratingDisplay}</span>
            {listing.review_count > 0 && (
              <span className="text-xs text-zinc-500">({listing.review_count})</span>
            )}
          </div>

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {listing.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="inline-block bg-zinc-100 text-zinc-700 text-xs px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
              {listing.tags.length > 2 && (
                <span className="text-xs text-zinc-500 px-2 py-1">+{listing.tags.length - 2}</span>
              )}
            </div>
          )}

          {/* CTA */}
          <button className="w-full mt-3 rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 transition-colors">
            View Details
          </button>
        </div>
      </div>
    </Link>
  )
}
