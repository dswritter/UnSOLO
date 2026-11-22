import { describe, expect, it } from 'vitest'
import { destinationHit, mergeHits, osmHit } from './places'

describe('places', () => {
  it('maps destinations and OpenStreetMap rows', () => {
    expect(destinationHit({ name: 'Manali', state: 'Himachal Pradesh', slug: 'manali' })).toEqual({ name: 'Manali', slug: 'manali', lat: null, lng: null, detail: 'Himachal Pradesh' })
    expect(osmHit({ name: 'Kaza', lat: '32.22', lon: '78.07', class: 'place', address: { state_district: 'Lahaul and Spiti', state: 'Himachal Pradesh' } }))
      .toEqual({ name: 'Kaza', slug: null, lat: 32.22, lng: 78.07, detail: 'Lahaul and Spiti, Himachal Pradesh' })
    expect(osmHit({ name: 'NH 3', class: 'highway' })).toBeNull()
  })
  it('keeps one entry per place, first source wins', () => {
    const a = { name: 'Manali', slug: 'manali', lat: null, lng: null, detail: 'HP' }
    const b = { name: 'manali', slug: null, lat: 1, lng: 2, detail: null }
    const c = { name: 'Kasol', slug: null, lat: null, lng: null, detail: null }
    expect(mergeHits([[a], [b, c]], 8)).toEqual([a, c])
    expect(mergeHits([[a, c]], 1)).toEqual([a])
  })
})
