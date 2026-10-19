import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceListing } from '@/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/profile', () => ({ startDirectMessage: vi.fn() }))
vi.mock('./ListingBookingForm', () => ({ ListingBookingForm: () => null }))
vi.mock('./RentalCartCheckout', () => ({ RentalCartCheckout: () => null }))
vi.mock('@/components/ui/ImageLightbox', () => ({ ImageLightbox: () => null }))
import { ListingDetailClient } from './ListingDetailClient'

const listing: ServiceListing = {
  id: 'listing', title: 'Mountain stay', slug: 'mountain-stay', type: 'stays',
  description: null, short_description: null, price_paise: 10000, unit: 'per_night',
  location: 'Manali', destination_id: 'destination', destination_ids: ['destination'],
  latitude: null, longitude: null, max_guests_per_booking: null, quantity_available: null,
  images: [], amenities: [], tags: [], metadata: null, host_id: null,
  is_active: true, is_featured: false, status: 'approved', average_rating: 0, review_count: 0,
  created_at: '2026-01-01', updated_at: '2026-01-01',
}
const host = {
  id: 'host', username: '', full_name: 'Strangers Tribe', avatar_url: null,
  host_rating: null, is_verified: false,
}

describe('listing host links', () => {
  it('links both the name and View profile for an admin-added host without enabling messaging', () => {
    const html = renderToStaticMarkup(createElement(ListingDetailClient, {
      listing, host: { ...host, profileHref: '/hosts/service/listing' },
    }))
    expect(html.match(/href="\/hosts\/service\/listing"/g)).toHaveLength(2)
    expect(html).toContain('View profile')
    expect(html).not.toContain('>Message<')
  })
  it('preserves linked host messaging and encodes the profile username', () => {
    const html = renderToStaticMarkup(createElement(ListingDetailClient, {
      listing, host: { ...host, username: 'strangers tribe' },
    }))
    expect(html.match(/href="\/profile\/strangers%20tribe"/g)).toHaveLength(2)
    expect(html).toContain('Message</button>')
  })
  it('does not invent a profile link when no identity is available', () => {
    const html = renderToStaticMarkup(createElement(ListingDetailClient, { listing, host }))
    expect(html).toContain('Strangers Tribe')
    expect(html).not.toContain('View profile')
    expect(html).not.toContain('Message</button>')
  })
})
