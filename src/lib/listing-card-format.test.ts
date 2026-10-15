// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compactTripDuration, primaryTripBadge, shortListingLocation, unitShortLabel } from '@/lib/listing-card-format'
import { DETAIL_PREVIEW_TTL_MS, readDetailPreview, writeDetailPreview, type DetailPreview } from '@/lib/detail-preview'

describe('shortListingLocation', () => {
  it('prefers structured destination', () => {
    expect(shortListingLocation('anything', { name: 'Joshimath', state: 'Uttarakhand' })).toBe('Joshimath, Uttarakhand')
  })

  it('reduces long uppercase addresses to the town', () => {
    expect(shortListingLocation('SK APARTMENTS, LANE NO 8, CLEMENT TOWN, DEHRADUN - 248002')).toBe('Dehradun')
    expect(shortListingLocation('A. T. ROAD, TARAJAN, JORHAT, ASSAM')).toBe('Jorhat, Assam')
    expect(shortListingLocation('D-27, Sector 52, Noida')).toBe('Noida')
    expect(shortListingLocation('')).toBe('')
  })
})

describe('card labels', () => {
  it('formats duration and units compactly', () => {
    expect(compactTripDuration({ duration_days: 6 })).toBe('6D/5N')
    expect(compactTripDuration({ duration_days: 3, trip_days: 3, trip_nights: 2 })).toBe('3D/2N')
    expect(unitShortLabel('per_day')).toBe('day')
  })

  it('shows only the highest-priority badge', () => {
    expect(primaryTripBadge({ pastEdition: true, spotsLeft: 2, isFeatured: true, isCommunity: true })?.label).toBe('Past trip')
    expect(primaryTripBadge({ pastEdition: false, spotsLeft: 2, isFeatured: true, isCommunity: true })?.label).toBe('Only 2 left')
    expect(primaryTripBadge({ pastEdition: false, spotsLeft: 9, isFeatured: true, isCommunity: true })?.label).toBe('Featured')
    expect(primaryTripBadge({ pastEdition: false, spotsLeft: null, isFeatured: false, isCommunity: true })?.label).toBe('Community')
    expect(primaryTripBadge({ pastEdition: false, spotsLeft: 0, isFeatured: false, isCommunity: false })).toBeNull()
  })
})

describe('detail preview store', () => {
  const preview: DetailPreview = {
    title: 'Sama Village', image: null, imageSizes: '100vw', location: 'Sama', meta: [], price: '₹8,000', priceSuffix: 'person', priceFrom: false,
  }

  beforeEach(() => {
    // Node's own (file-less) localStorage global shadows happy-dom's.
    vi.stubGlobal('localStorage', window.sessionStorage)
    window.sessionStorage.clear()
  })

  it('round-trips and expires', () => {
    writeDetailPreview('/packages/sama', preview, 1_000)
    expect(readDetailPreview('/packages/sama', 2_000)?.title).toBe('Sama Village')
    expect(readDetailPreview('/packages/sama', 2_000)).toBe(readDetailPreview('/packages/sama', 2_000))
    expect(readDetailPreview('/packages/sama', 1_000 + DETAIL_PREVIEW_TTL_MS + 1)).toBeNull()
  })

  it('keeps only the most recent entries', () => {
    for (let i = 0; i < 30; i++) writeDetailPreview(`/packages/t${i}`, preview, i)
    expect(readDetailPreview('/packages/t0', 30)).toBeNull()
    expect(readDetailPreview('/packages/t29', 30)).not.toBeNull()
  })
})
