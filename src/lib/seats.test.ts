import { describe, expect, it } from 'vitest'
import { seatCenter, seatLong, seatShort, seatsScarce } from './seats'

describe('spots copy', () => {
  it('shows only what is open while nobody has booked', () => {
    expect(seatShort(12, 12)).toBe('12 spots open')
    expect(seatCenter(12, 12)).toEqual({ big: '12', small: 'spots open' })
  })
  it('shows only the bookings while under half full; the total only on the trip page', () => {
    expect(seatShort(12, 9)).toBe('3 going')
    expect(seatLong(12, 9)).toBe('3 going · group of 12')
    expect(seatCenter(12, 7)).toEqual({ big: '5', small: 'going' })
  })
  it('shows N/M once half or more are booked', () => {
    expect(seatShort(12, 6)).toBe('6/12 spots left')
    expect(seatShort(12, 1)).toBe('1/12 spot left')
    expect(seatLong(12, 4)).toBe('4 of 12 spots left')
    expect(seatCenter(12, 4)).toEqual({ big: '4', of: '/12', small: 'spots left' })
  })
  it('full', () => {
    expect(seatShort(12, 0)).toBe('Full')
    expect(seatCenter(12, 0)).toEqual({ big: '12', of: '/12', small: 'full' })
  })
  it('urgency only once half booked', () => {
    expect(seatsScarce(6, 5)).toBe(false)
    expect(seatsScarce(6, 3)).toBe(true)
    expect(seatsScarce(null, 3)).toBe(false)
  })
})
