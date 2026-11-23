import { describe, expect, it } from 'vitest'
import { ringLabel, spotsCenter } from './SeatRing'

describe('trip ring centre label', () => {
  it('reads "12 spots open", "4 going", "6/12 spots left", "1/12 spot left" and "12/12 full"', () => {
    expect(spotsCenter(12, 12)).toMatchObject({ big: '12', small: 'spots open' })
    expect(spotsCenter(12, 8)).toMatchObject({ big: '4', small: 'going' })
    expect(spotsCenter(12, 6)).toMatchObject({ big: '6', of: '/12', small: 'spots left' })
    expect(spotsCenter(12, 1)).toMatchObject({ big: '1', of: '/12', small: 'spot left' })
    expect(spotsCenter(12, 0)).toMatchObject({ big: '12', of: '/12', small: 'full' })
  })
  it('says spots, not seats, to screen readers', () => {
    expect(ringLabel(12, 4)).toBe('8 of 12 spots open')
  })
})
