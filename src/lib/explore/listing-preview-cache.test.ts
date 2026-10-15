// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  LISTING_PREVIEW_TTL_MS,
  clearListingPreviewMemory,
  previewKindForParams,
  readListingPreview,
  writeListingPreview,
} from '@/lib/explore/listing-preview-cache'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'

const listing = { id: 'l1', title: 'Scooter', items: [] } as unknown as ServiceListingWithItems

describe('listing preview cache', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearListingPreviewMemory()
  })

  it('round-trips through sessionStorage and returns a stable reference', () => {
    writeListingPreview('rentals', { listings: [listing] }, 1_000)
    clearListingPreviewMemory()
    const first = readListingPreview('rentals', 2_000)
    expect(first?.listings.map(l => l.id)).toEqual(['l1'])
    expect(readListingPreview('rentals', 2_000)).toBe(first)
  })

  it('expires stale snapshots', () => {
    writeListingPreview('stays', { listings: [listing] }, 0)
    expect(readListingPreview('stays', LISTING_PREVIEW_TTL_MS + 1)).toBeNull()
  })

  it('ignores corrupt storage', () => {
    sessionStorage.setItem('unsolo:listing-preview:v1:trips', '{nope')
    expect(readListingPreview('trips')).toBeNull()
  })
})

describe('previewKindForParams', () => {
  it('previews plain View all links only', () => {
    expect(previewKindForParams({ search: '1', tab: 'rentals' })).toBe('rentals')
    expect(previewKindForParams({ search: '1' })).toBe('trips')
    expect(previewKindForParams({ search: '1', tab: 'trips', q: 'goa' })).toBeNull()
    expect(previewKindForParams({ search: '1', tab: 'bogus' })).toBeNull()
  })
})
