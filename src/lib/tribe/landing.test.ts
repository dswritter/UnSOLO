import { describe, expect, it } from 'vitest'
import { suggestLandingTab } from './landing'
import { isQuietNow, DEFAULT_PREFERENCES } from './preferences'

describe('suggestLandingTab', () => {
  it('suggests the dominant tab', () => {
    expect(suggestLandingTab({ explore: 2, tribe: 7, trips: 1 }, 'explore', null)).toBe('tribe')
  })
  it('does nothing below 3 opens, on ties, or when already the landing tab', () => {
    expect(suggestLandingTab({ explore: 0, tribe: 2, trips: 0 }, 'explore', null)).toBeNull()
    expect(suggestLandingTab({ explore: 4, tribe: 4, trips: 0 }, 'trips', null)).toBeNull()
    expect(suggestLandingTab({ explore: 1, tribe: 9, trips: 0 }, 'tribe', null)).toBeNull()
  })
  it('respects a recent dismissal', () => {
    const now = Date.now()
    expect(suggestLandingTab({ explore: 0, tribe: 9, trips: 0 }, 'explore', new Date(now - 86400_000).toISOString(), now)).toBeNull()
    expect(suggestLandingTab({ explore: 0, tribe: 9, trips: 0 }, 'explore', new Date(now - 40 * 86400_000).toISOString(), now)).toBe('tribe')
  })
})

describe('isQuietNow', () => {
  it('honours overnight quiet hours in IST but lets messages through', () => {
    const at2330IST = new Date('2026-11-20T18:00:00Z')
    expect(isQuietNow(DEFAULT_PREFERENCES, 'plans', at2330IST)).toBe(true)
    expect(isQuietNow(DEFAULT_PREFERENCES, 'messages', at2330IST)).toBe(false)
    expect(isQuietNow(DEFAULT_PREFERENCES, 'plans', new Date('2026-11-20T06:30:00Z'))).toBe(false)
  })
})
