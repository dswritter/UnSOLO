'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ServiceListing } from '@/types'
import { formatPrice, cn } from '@/lib/utils'
import { Star } from 'lucide-react'

interface ServiceListingCardProps {
  listing: ServiceListing
}

export function ServiceListingCard({ listing }: ServiceListingCardProps) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.svg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  // Type-specific display logic — only render parts that have real data.
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
        if (m.difficulty) parts.push(m.difficulty)
        break
      case 'rentals':
        if (m.vehicle_type) parts.push(m.vehicle_type)
        if (m.mileage_limit_km) parts.push(`${m.mileage_limit_km} km limit`)
        break
      case 'getting_around':
        if (m.transport_type) parts.push(m.transport_type)
        if (m.capacity_persons) parts.push(`${m.capacity_persons} seats`)
        break
    }
    return parts.join(' • ')
  }

  return (
    <Link href={`/listings/${listing.type}/${listing.slug}`}>
      <div className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-all duration-300',
        'hover:shadow-xl hover:scale-[1.02]',
        'hover:bg-gradient-to-br hover:from-card hover:to-secondary/50',
        'border-border dark:border-border'
      )}>
        {/* Image */}
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

        {/* Content */}
        <div className="p-4 space-y-2">
          {/* Title & Location */}
          <div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-2">{listing.title}</h3>
            <p className="text-xs text-muted-foreground">{listing.location}</p>
          </div>

          {/* Metadata */}
          <p className="text-xs text-muted-foreground">{getMetadataDisplay()}</p>

          {/* Price */}
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-foreground">{formatPrice(listing.price_paise)}</span>
            <span className="text-xs text-muted-foreground">/ {listing.unit.replace('_', ' ')}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-medium text-foreground">{ratingDisplay}</span>
            {listing.review_count > 0 && (
              <span className="text-xs text-muted-foreground">({listing.review_count})</span>
            )}
          </div>

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
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

          {/* CTA */}
          <button className="w-full mt-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 transition-colors">
            View Details
          </button>
        </div>
      </div>
    </Link>
  )
}
