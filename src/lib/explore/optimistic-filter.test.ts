import { describe, expect, it } from 'vitest'
import type { Package, ServiceListing } from '@/types'
import {
  exploreFilterKey,
  exploreParamsFromHref,
  exploreTabFromParams,
  packageMatchesExploreParams,
  serviceMatchesExploreParams,
} from './optimistic-filter'

const pkg = (overrides: Partial<Package> = {}) => ({
  id: 'p1',
  title: 'Valley of Flowers trek',
  price_paise: 1_500_000,
  duration_days: 5,
  difficulty: 'easy',
  host_id: null,
  created_on_behalf_by: null,
  departure_dates: ['2026-07-10', '2026-08-02'],
  departure_dates_closed: ['2026-08-02'],
  destination: { name: 'Chamoli', state: 'Uttarakhand' },
  ...overrides,
}) as unknown as Package

const listing = (overrides: Partial<ServiceListing> = {}) => ({
  id: 's1',
  title: 'Riverside camp',
  type: 'stays',
  price_paise: 300_000,
  amenities: ['wifi', 'parking'],
  metadata: null,
  location: 'Rishikesh',
  ...overrides,
}) as unknown as ServiceListing

describe('exploreParamsFromHref', () => {
  it('parses query and drops hashes', () => {
    expect(exploreParamsFromHref('/?search=1&tab=trips&difficulty=easy#wander-explore'))
      .toEqual({ search: '1', tab: 'trips', difficulty: 'easy' })
    expect(exploreParamsFromHref('/')).toEqual({})
  })
})

describe('exploreFilterKey', () => {
  it('ignores ordering, search/page flags and empty values', () => {
    expect(exploreFilterKey({ search: '1', tab: 'trips', difficulty: 'easy', page: '2', q: '' }))
      .toBe(exploreFilterKey({ difficulty: 'easy', tab: 'trips' }))
  })
})

describe('exploreTabFromParams', () => {
  it('defaults to trips', () => {
    expect(exploreTabFromParams({})).toBe('trips')
    expect(exploreTabFromParams({ tab: 'rentals' })).toBe('rentals')
  })
})

describe('packageMatchesExploreParams', () => {
  it('matches difficulty, budget, and duration bounds', () => {
    expect(packageMatchesExploreParams(pkg(), { difficulty: 'easy' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { difficulty: 'moderate' })).toBe(false)
    expect(packageMatchesExploreParams(pkg(), { maxBudget: '10000' })).toBe(false)
    expect(packageMatchesExploreParams(pkg(), { minBudget: '10000', maxBudget: '20000' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { minDays: '4', maxDays: '7' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { minDays: '8' })).toBe(false)
  })

  it('treats staff-created listings as community trips', () => {
    expect(packageMatchesExploreParams(pkg(), { tripSource: 'unsolo' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { tripSource: 'community' })).toBe(false)
    expect(packageMatchesExploreParams(pkg({ created_on_behalf_by: 'staff' }), { tripSource: 'community' })).toBe(true)
  })

  it('only counts open departures for month filters', () => {
    expect(packageMatchesExploreParams(pkg(), { month: '6' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { month: '7' })).toBe(false)
  })

  it('applies interested and text filters', () => {
    expect(packageMatchesExploreParams(pkg(), { interested: 'true' }, new Set())).toBe(false)
    expect(packageMatchesExploreParams(pkg(), { interested: 'true' }, new Set(['p1']))).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { q: 'uttarakhand' })).toBe(true)
    expect(packageMatchesExploreParams(pkg(), { q: 'goa' })).toBe(false)
  })
})

describe('serviceMatchesExploreParams', () => {
  it('scopes by tab and price', () => {
    expect(serviceMatchesExploreParams(listing(), {}, 'stays')).toBe(true)
    expect(serviceMatchesExploreParams(listing(), {}, 'rentals')).toBe(false)
    expect(serviceMatchesExploreParams(listing(), { maxPrice: '2000' }, 'stays')).toBe(false)
    expect(serviceMatchesExploreParams(listing(), { minPrice: '2000', maxPrice: '5000' }, 'stays')).toBe(true)
  })

  it('checks activity difficulty from metadata', () => {
    const activity = listing({ type: 'activities', metadata: { difficulty: 'easy' } as ServiceListing['metadata'] })
    expect(serviceMatchesExploreParams(activity, { difficulty: 'easy' }, 'activities')).toBe(true)
    expect(serviceMatchesExploreParams(activity, { difficulty: 'challenging' }, 'activities')).toBe(false)
  })
})
