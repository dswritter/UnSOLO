'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'
import type { ServiceListing, ServiceListingItem } from '@/types'
import {
  SERVICE_LISTING_PREVIEW_HANDOFF_KEY,
  type HostServiceListingPreviewPayload,
} from '@/lib/host-service-listing-preview-session'

/**
 * Client-side preview for an unsaved / in-progress service listing. Reads the
 * form snapshot from localStorage (written by HostServiceListingTabs when the
 * host clicks Preview), synthesises `ServiceListing` + `ServiceListingItem[]`
 * shapes, and delegates rendering to the same ListingDetailClient that powers
 * the public listing page — so the host sees exactly what users will see.
 */
export function HostServiceListingPreviewClient() {
  const [payload, setPayload] = useState<HostServiceListingPreviewPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SERVICE_LISTING_PREVIEW_HANDOFF_KEY)
      if (!raw) {
        setLoadError('Preview data not found. Close this tab and click Preview again.')
        return
      }
      const parsed = JSON.parse(raw) as HostServiceListingPreviewPayload
      setPayload(parsed)
    } catch {
      setLoadError('Preview data is corrupted. Close this tab and click Preview again.')
    }
  }, [])

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Link href="/host" className="text-sm text-primary underline">Back to Host dashboard</Link>
        </div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const { listing, items } = buildPreviewShape(payload)

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-amber-700 font-medium">
          Host preview — unsaved changes shown. Travelers will not see this until admin approval.
        </span>
        <button
          type="button"
          onClick={() => window.close()}
          className="text-sm text-amber-700 underline hover:text-amber-900"
        >
          Close preview
        </button>
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <ListingDetailClient listing={listing} items={items} host={null} />
      </div>
    </div>
  )
}

function buildPreviewShape(p: HostServiceListingPreviewPayload): {
  listing: ServiceListing
  items: ServiceListingItem[]
} {
  const now = new Date().toISOString()

  // Pick cheapest item price as the headline price (mirrors how items drive
  // the displayed price in ListingDetailClient when items exist).
  const firstItem = p.items[0]
  const headlinePricePaise = firstItem
    ? Math.round((firstItem.priceRupees || 0) * 100)
    : 0

  const listing: ServiceListing = {
    id: 'preview',
    title: p.title || '(untitled)',
    slug: 'preview',
    description: p.description || null,
    short_description: p.shortDescription || null,
    type: p.type,
    price_paise: headlinePricePaise,
    unit: p.unit,
    location: p.location || '',
    destination_id: p.destinationId || '',
    destination_ids: p.destinationId ? [p.destinationId] : [],
    latitude: p.pinLat,
    longitude: p.pinLon,
    max_guests_per_booking: null,
    quantity_available: null,
    images: p.hostImages.length > 0 ? p.hostImages : (firstItem?.images ?? []),
    amenities: p.amenities,
    tags: p.tags,
    metadata: null,
    host_id: null,
    is_active: true,
    is_featured: false,
    status: 'pending',
    average_rating: 0,
    review_count: 0,
    created_at: now,
    updated_at: now,
    destination: p.destinationName && p.destinationState && p.destinationId
      ? {
          id: p.destinationId,
          name: p.destinationName,
          state: p.destinationState,
          country: 'India',
          slug: '',
          image_url: null,
          description: null,
          created_at: now,
        }
      : undefined,
  }

  const items: ServiceListingItem[] = p.items.map((it, i) => ({
    id: `preview-item-${i}`,
    service_listing_id: 'preview',
    name: it.name || '(unnamed item)',
    description: it.description || null,
    price_paise: Math.round((it.priceRupees || 0) * 100),
    quantity_available: it.quantity,
    max_per_booking: it.maxPerBooking,
    images: it.images,
    position_order: i,
    is_active: true,
    unit: it.unit ?? null,
    amenities: it.amenities ?? null,
    created_at: now,
    updated_at: now,
  }))

  return { listing, items }
}
