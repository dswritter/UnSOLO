import { describe, expect, it } from 'vitest'
import { listingToTripLite, unitLabel } from './listings'

describe('listingToTripLite', () => {
  it('maps a stay to a card that opens its web listing', () => {
    const t = listingToTripLite({
      id: 'l1', slug: 'tent camp', title: 'Tent camp', images: ['https://x/a.webp'], price_paise: 95000, unit: 'per_night',
      destination: { name: 'Manali', slug: 'manali' }, latitude: 32.2, longitude: 77.1,
    }, 'stays', null)
    expect(t).toMatchObject({
      kind: 'stay', unit: 'night', priceFromPaise: 95000, nextDeparture: null, seatsLeft: null,
      place: { name: 'Manali', slug: 'manali', lat: 32.2, lng: 77.1 }, webPath: '/listings/stays/tent%20camp',
    })
    expect(t.image?.url).toBe('https://x/a.webp')
  })

  it('falls back to the free-text location when there is no destination', () => {
    expect(listingToTripLite({ id: 'l2', slug: 's', title: 'Bike', location: ' Leh ', price_paise: '1200' }, 'rentals', null).place?.name).toBe('Leh')
  })

  it('labels units', () => {
    expect(unitLabel('per_person')).toBe('person')
    expect(unitLabel('per_day')).toBe('day')
    expect(unitLabel(null)).toBeNull()
  })
})
