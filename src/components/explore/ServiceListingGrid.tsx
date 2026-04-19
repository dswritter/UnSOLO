'use client'

import type { ServiceListing } from '@/types'
import { ServiceListingCard } from './ServiceListingCard'

interface ServiceListingGridProps {
  listings: ServiceListing[]
  isLoading?: boolean
}

export function ServiceListingGrid({ listings, isLoading }: ServiceListingGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-zinc-100 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-zinc-500">No listings found. Try adjusting your filters.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((listing) => (
        <ServiceListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}
