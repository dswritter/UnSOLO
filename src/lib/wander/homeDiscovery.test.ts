import { describe, expect, it } from 'vitest'
import {
  buildRegionTiles,
  buildVibeBuckets,
  pickReviewCards,
  rankHosts,
  truncateReview,
  type DiscoveryPackage,
  type HostCandidate,
  type ReviewRow,
} from './homeDiscovery'

function pkg(overrides: Partial<DiscoveryPackage> & { id: string }): DiscoveryPackage {
  return {
    title: 'Trip',
    short_description: null,
    description: null,
    metadata: null,
    price_paise: 2_000_000,
    duration_days: 5,
    difficulty: 'moderate',
    images: [`https://x.supabase.co/${overrides.id}.jpg`],
    host_id: null,
    destination: { name: 'Manali', state: 'Himachal Pradesh', country: 'India', image_url: null },
    ...overrides,
  }
}

describe('buildRegionTiles', () => {
  it('groups by state, ranks by trip count and uses the state as the search query', () => {
    const tiles = buildRegionTiles([
      pkg({ id: 'a' }),
      pkg({ id: 'b', destination: { name: 'Kasol', state: 'Himachal Pradesh', country: 'India', image_url: 'https://img/kasol.jpg' } }),
      pkg({ id: 'c', destination: { name: 'Rishikesh', state: 'Uttarakhand', country: 'India', image_url: null } }),
    ])
    expect(tiles.map(t => [t.label, t.tripCount, t.query])).toEqual([
      ['Himachal Pradesh', 2, 'Himachal Pradesh'],
      ['Uttarakhand', 1, 'Uttarakhand'],
    ])
    expect(tiles[0]!.imageUrl).toBe('https://x.supabase.co/a.jpg')
    expect(tiles[0]!.fallbackImageUrl).toBe('https://img/kasol.jpg')
    expect(tiles[0]!.caption).toBe('Kasol · Manali')
    expect(tiles[1]!.imageUrl).toBe('https://x.supabase.co/c.jpg')
    expect(tiles[1]!.fallbackImageUrl).toBeNull()
  })

  it('falls back to destination name, shows the country abroad and skips unknown places', () => {
    const tiles = buildRegionTiles([
      pkg({ id: 'a', destination: { name: 'Bali', state: '', country: 'Indonesia', image_url: null } }),
      pkg({ id: 'b', destination: null }),
    ])
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ label: 'Bali', caption: 'Indonesia', query: 'Bali' })
  })

  it('respects the limit', () => {
    const many = Array.from({ length: 9 }, (_, i) => pkg({ id: `p${i}`, destination: { name: `D${i}`, state: `S${i}`, country: 'India', image_url: null } }))
    expect(buildRegionTiles(many, 4)).toHaveLength(4)
  })
})

describe('buildVibeBuckets', () => {
  it('counts trips per vibe with Explore-compatible params and hides empty vibes', () => {
    const vibes = buildVibeBuckets([
      pkg({ id: 'w', duration_days: 2, price_paise: 800_000, difficulty: 'easy' }),
      pkg({ id: 's', title: 'Kedarkantha Snow Trek', duration_days: 6 }),
      pkg({ id: 'l', duration_days: 10, metadata: { theme: 'Spiritual circuit' } }),
    ])
    const byId = Object.fromEntries(vibes.map(v => [v.id, v]))
    expect(byId.weekend).toMatchObject({ tripCount: 1, params: { minDays: '1', maxDays: '3' } })
    expect(byId.budget).toMatchObject({ tripCount: 1, params: { maxBudget: '10000' } })
    expect(byId.beginner?.tripCount).toBe(1)
    expect(byId.snow).toMatchObject({ tripCount: 1, params: { q: 'snow' } })
    expect(byId.spiritual?.tripCount).toBe(1)
    expect(byId.long?.tripCount).toBe(1)
  })

  it('matches keywords as whole words only and avoids reusing cover images', () => {
    const vibes = buildVibeBuckets([
      pkg({ id: 'a', title: 'Snowfall views', duration_days: 2 }),
      pkg({ id: 'b', duration_days: 2, difficulty: 'easy' }),
    ])
    expect(vibes.find(v => v.id === 'snow')).toBeUndefined()
    const weekend = vibes.find(v => v.id === 'weekend')!
    const beginner = vibes.find(v => v.id === 'beginner')!
    expect(weekend.imageUrl).not.toBe(beginner.imageUrl)
  })
})

describe('rankHosts', () => {
  const host = (id: string, extra: Partial<HostCandidate> = {}): HostCandidate => ({
    id, username: id, full_name: null, avatar_url: null, bio: null, location: null,
    host_rating: 0, total_hosted_trips: 0, is_verified: false, ...extra,
  })

  it('orders by rating, then hosted trips, and drops hosts without live listings or usernames', () => {
    const live = new Map([['a', 1], ['b', 2], ['c', 1], ['d', 1]])
    const ranked = rankHosts([
      host('a', { host_rating: 4.5, total_hosted_trips: 2 }),
      host('b', { host_rating: 4.5, total_hosted_trips: 9 }),
      host('c'),
      host('d', { username: null }),
      host('e', { host_rating: 5 }),
    ], live)
    expect(ranked.map(h => h.id)).toEqual(['b', 'a', 'c'])
    expect(ranked[2]!.rating).toBeNull()
    expect(ranked[0]!.liveListings).toBe(2)
  })
})

describe('pickReviewCards', () => {
  const review = (id: string, extra: Partial<ReviewRow> = {}): ReviewRow => ({
    id, user_id: `u-${id}`, package_id: 'p1', rating: 5, title: null,
    body: 'An unforgettable week with wonderful people.', images: null,
    created_at: `2025-01-0${id}T00:00:00Z`, ...extra,
  })
  const profiles = new Map([
    ['u-1', { username: 'asha', full_name: 'Asha', avatar_url: null }],
    ['u-2', { username: 'ravi', full_name: null, avatar_url: null }],
    ['u-3', { username: 'meera', full_name: 'Meera', avatar_url: null }],
  ])
  const packages = new Map([['p1', { title: 'Spiti', slug: 'spiti', images: ['https://x/spiti.jpg'], is_active: true, destination: 'Spiti' }]])

  it('keeps recent substantive 5★ reviews, one per reviewer, newest first', () => {
    const cards = pickReviewCards([
      review('1'),
      review('2', { body: 'Great!' }),
      review('3', { rating: 4 }),
      review('4', { user_id: 'u-1' }),
      review('5', { user_id: 'missing' }),
    ], profiles, packages)
    expect(cards.map(c => c.id)).toEqual(['4'])
    expect(cards[0]!.imageUrl).toBe('https://x/spiti.jpg')
    expect(cards[0]!.trip).toEqual({ title: 'Spiti', slug: 'spiti', destination: 'Spiti' })
  })

  it('omits the trip link for inactive trips and prefers review photos', () => {
    const inactive = new Map([['p1', { title: 'Old', slug: 'old', images: null, is_active: false, destination: null }]])
    const [card] = pickReviewCards([review('3', { images: ['https://x/own.jpg'] })], profiles, inactive)
    expect(card!.trip).toBeNull()
    expect(card!.imageUrl).toBe('https://x/own.jpg')
  })
})

describe('truncateReview', () => {
  it('collapses whitespace and cuts on a word boundary', () => {
    expect(truncateReview('a  b\n c')).toBe('a b c')
    const out = truncateReview('word '.repeat(80), 30)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(31)
  })
})
