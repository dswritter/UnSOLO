/**
 * Payload for `/host/service-listing-preview`, written from HostServiceListingTabs
 * before opening the preview. Uses localStorage because `window.open(..., '_blank')`
 * opens a new tab that cannot see sessionStorage from the parent.
 */
export const SERVICE_LISTING_PREVIEW_HANDOFF_KEY = 'unsolo_host_service_listing_preview_handoff'

export type HostServiceListingPreviewPayload = {
  type: 'stays' | 'activities' | 'rentals' | 'getting_around'
  title: string
  shortDescription: string
  description: string
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'
  location: string
  pinLat: number | null
  pinLon: number | null
  destinationId: string | null
  destinationName: string | null
  destinationState: string | null
  amenities: string[]
  tags: string[]
  hostImages: string[]
  items: {
    name: string
    description: string
    priceRupees: number
    quantity: number
    maxPerBooking: number
    images: string[]
    unit?: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month' | null
    amenities?: string[] | null
  }[]
}
