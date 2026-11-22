import { describe, expect, it } from 'vitest'
import { addDays, isTripDay, tripEndDate } from './tripDays'

describe('trip days', () => {
  it('computes the last day', () => {
    expect(tripEndDate('2026-03-30', 4)).toBe('2026-04-02')
    expect(tripEndDate('2026-03-30', null)).toBe('2026-03-30')
  })
  it('is a trip day from start to the day after the end', () => {
    expect(isTripDay('2026-03-30', 4, '2026-03-29')).toBe(false)
    expect(isTripDay('2026-03-30', 4, '2026-03-30')).toBe(true)
    expect(isTripDay('2026-03-30', 4, '2026-04-03')).toBe(true)
    expect(isTripDay('2026-03-30', 4, '2026-04-04')).toBe(false)
  })
  it('adds days across months', () => { expect(addDays('2026-02-28', 1)).toBe('2026-03-01') })
})
