import { describe, expect, it } from 'vitest'
import { appendUniqueById, matchesExploreSearch } from './local-search'

describe('Explore local search and page appending', () => {
  it('immediately searches titles, destinations, descriptions, tags, and structured metadata', () => {
    const trip = {
      title: 'Hillside getaway', description: 'Small group trail walks',
      destination: { name: 'Gangtok', state: 'Sikkim' },
      metadata: { season: 'monsoon', activities: ['bird watching'] },
    }
    expect(matchesExploreSearch([trip.title, trip.description, trip.destination.name, trip.destination.state, trip.metadata], 'gangtok bird')).toBe(true)
    expect(matchesExploreSearch([trip.title, trip.description, trip.destination.name, trip.metadata], 'desert')).toBe(false)
    expect(matchesExploreSearch(['Tour', ['guide', 'equipment'], { category: 'kayaking' }], 'kayaking')).toBe(true)
  })

  it('appends later pages in order and removes overlap/duplicate IDs', () => {
    const first = [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }]
    const next = [{ id: '2', title: 'Duplicate boundary' }, { id: '3', title: 'Third' }, { id: '3', title: 'Repeated result' }]
    expect(appendUniqueById(first, next)).toEqual([...first, { id: '3', title: 'Third' }])
    expect(appendUniqueById(first, [])).toEqual(first)
  })
})
