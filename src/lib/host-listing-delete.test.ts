import { describe, expect, it } from 'vitest'
import { countActiveBookings, tripIsRunning } from '@/lib/host-listing-delete'

describe('host listing deletion rules', () => {
  const today = '2026-10-16'

  it('detects a running departure using return dates or duration', () => {
    expect(tripIsRunning({ departure_dates: ['2026-10-14'], return_dates: ['2026-10-18'], duration_days: 5 }, today)).toBe(true)
    expect(tripIsRunning({ departure_dates: ['2026-10-14'], duration_days: 3 }, today)).toBe(true)
    expect(tripIsRunning({ departure_dates: ['2026-10-14'], duration_days: 2 }, today)).toBe(false)
    expect(tripIsRunning({ departure_dates: ['2026-11-01'], duration_days: 4 }, today)).toBe(false)
    expect(tripIsRunning({ departure_dates: null, duration_days: 4 }, today)).toBe(false)
  })

  it('counts only pending/confirmed bookings that have not finished', () => {
    expect(countActiveBookings([
      { status: 'confirmed', travel_date: '2026-10-20' },
      { status: 'pending', travel_date: null },
      { status: 'confirmed', travel_date: '2026-09-01' },
      { status: 'cancelled', travel_date: '2026-12-01' },
      { status: 'completed', travel_date: '2026-12-01' },
    ], today)).toBe(2)
    expect(countActiveBookings([{ status: 'confirmed', travel_date: '2026-10-14' }], today, 5)).toBe(1)
    expect(countActiveBookings([{ status: 'confirmed', check_in_date: '2026-10-10', check_out_date: '2026-10-17' }], today)).toBe(1)
    expect(countActiveBookings([{ status: 'confirmed', check_in_date: '2026-10-10', check_out_date: '2026-10-12' }], today)).toBe(0)
  })
})
