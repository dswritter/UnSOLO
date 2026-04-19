'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ServiceListing } from '@/types'
import { ServiceListingCard } from '@/components/explore/ServiceListingCard'

interface ServiceCarouselProps {
  title: string
  listings: ServiceListing[]
  type: 'activities' | 'stays'
}

export function ServiceCarousel({ title, listings, type }: ServiceCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = 400
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (listings.length === 0) return null

  return (
    <>
      <style>{`
        .service-carousel::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div>
        <h2 className="text-lg font-bold mb-4">{title}</h2>

        {/* Carousel Container */}
        <div className="relative">
          {/* Scroll buttons */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/3 -translate-y-1/2 z-10 bg-primary/80 hover:bg-primary text-white rounded-full p-2 shadow-lg transition-all"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/3 -translate-y-1/2 z-10 bg-primary/80 hover:bg-primary text-white rounded-full p-2 shadow-lg transition-all"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            className="service-carousel flex gap-4 overflow-x-auto snap-x snap-mandatory"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="flex-none w-72 snap-center"
              >
                <ServiceListingCard listing={listing} />
              </div>
            ))}
          </div>
        </div>

        {/* Result count */}
        <div className="mt-4 text-xs text-muted-foreground">
          {listings.length} {type === 'activities' ? 'activities' : 'stays'} available
        </div>
      </div>
    </>
  )
}
