import { describe, expect, it } from 'vitest'
import { ageFrom, toHostTripSummary, toJoinRequest, toRosterBooking } from './shape'

describe('toHostTripSummary', () => {
  const row = {
    id: 't1', slug: 'spiti-1', title: 'Spiti', images: ['https://x/a.webp'], price_paise: 100000, duration_days: 5,
    trip_days: 5, trip_nights: 4, max_group_size: 10, moderation_status: 'approved', is_active: true, bookings_paused: false,
    departure_dates: ['2026-12-20', '2026-11-01', '2026-12-05'], return_dates: ['2026-12-24', '2026-11-05', '2026-12-09'],
    departure_dates_closed: ['2026-12-05'], booking_cutoff_dates: { '2026-12-20': '2026-12-15' },
    destination: { name: 'Spiti', state: 'Himachal Pradesh' },
  }

  it('lists upcoming departures with return, closed, cutoff and seats, and skips closed for next', () => {
    const s = toHostTripSummary(row, { today: '2026-11-22', booked: new Map([['2026-12-20', 3]]), pendingRequests: 2, bookingCount: 4 })
    expect(s.nextDeparture).toBe('2026-12-20')
    expect(s.departures).toEqual([
      { date: '2026-12-05', returnDate: '2026-12-09', closed: true, cutoff: null, booked: 0 },
      { date: '2026-12-20', returnDate: '2026-12-24', closed: false, cutoff: '2026-12-15', booked: 3 },
    ])
    expect(s).toMatchObject({ place: { name: 'Spiti', state: 'Himachal Pradesh' }, moderationStatus: 'approved', pendingRequests: 2, approvedRequests: 0, bookingCount: 4 })
  })
})

describe('request and roster shapes', () => {
  it('maps a join request with age and score', () => {
    expect(ageFrom('2000-01-01', Date.parse('2026-11-22'))).toBe(26)
    const r = toJoinRequest({ id: 'r', user_id: 'u', status: 'pending', message: 'hi', created_at: 'now', user: { id: 'u', username: 'ravi', full_name: 'Ravi', date_of_birth: null } }, { trips_completed: 3, total_score: 120 })
    expect(r.user).toMatchObject({ id: 'u', name: 'Ravi', age: null, tripsCompleted: 3, score: 120 })
    expect(r.hostResponse).toBeNull()
  })

  it('maps a roster booking', () => {
    const b = toRosterBooking({ id: 'b', status: 'cancelled', travel_date: '2026-12-05', guests: 2, traveller_details: [{ name: 'A', age: '30', gender: 'male' }, { name: 'B' }], discount_paise: 500, refund_amount_paise: 0, user: { id: 'u', username: 'ravi', phone_number: '+91 98' } }, 'WELCOME (₹5 off)')
    expect(b).toMatchObject({ status: 'cancelled', travelDate: '2026-12-05', coupon: 'WELCOME (₹5 off)', refundPaise: 0, lead: { phone: '+91 98' } })
    expect(b.travellers).toEqual([{ name: 'A', age: 30, gender: 'male' }, { name: 'B', age: null, gender: null }])
  })
})
