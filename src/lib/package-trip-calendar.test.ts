import { describe, expect, it } from 'vitest'
import { packageNextOpenDepartureKey } from './package-trip-calendar'

describe('packageNextOpenDepartureKey', () => {
  it('returns the earliest open departure on or after today', () => {
    const pkg = {
      departure_dates: ['2026-11-20', '2026-10-10', '2026-10-25', '2026-10-18'],
      departure_dates_closed: ['2026-10-18'],
    }
    expect(packageNextOpenDepartureKey(pkg, '2026-10-16')).toBe('2026-10-25')
  })

  it('returns null when nothing is dated or open', () => {
    expect(packageNextOpenDepartureKey({ departure_dates: [] }, '2026-10-16')).toBeNull()
    expect(packageNextOpenDepartureKey({ departure_dates: ['2026-01-01'] }, '2026-10-16')).toBeNull()
  })
})
