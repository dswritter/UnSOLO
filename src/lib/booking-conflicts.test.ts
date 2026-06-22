import { describe, it, expect } from 'vitest'
import { evaluateBookingConflicts, type ExistingBookingForConflict, type NewBookingAttempt } from './booking-conflicts'

const D = (iso: string) => new Date(iso).getTime()
// Existing TripX booking: self + A + B, 10–15 Jul.
const existingX: ExistingBookingForConflict = {
  packageId: 'X',
  travelDate: '2026-07-10',
  travellerNames: ['Subodh', 'User A', 'User B'],
  startMs: D('2026-07-10'),
  endMs: D('2026-07-15'),
}
const attempt = (over: Partial<NewBookingAttempt>): NewBookingAttempt => ({
  packageId: 'X',
  travelDate: '2026-08-01',
  travellerNames: [],
  selfName: 'Subodh',
  startMs: D('2026-08-01'),
  endMs: D('2026-08-06'),
  ...over,
})

describe('evaluateBookingConflicts', () => {
  it('#1 new traveller only, different date → allow (no prevent, no warnings)', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['User C'] }), [existingX])
    expect(r.prevent).toBeUndefined()
    expect(r.warnings).toEqual([])
  })

  it('#2a includes self when self already booked → prevent', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['User C', 'Subodh'] }), [existingX])
    expect(r.prevent).toMatch(/yourself/i)
  })

  it('#2a self only when already booked → prevent', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['Subodh'] }), [existingX])
    expect(r.prevent).toMatch(/yourself/i)
  })

  it('#2b exact duplicate (same date + same travellers, no self) → prevent', () => {
    const existingFriends: ExistingBookingForConflict = {
      packageId: 'X', travelDate: '2026-07-10', travellerNames: ['User A', 'User B'],
      startMs: D('2026-07-10'), endMs: D('2026-07-15'),
    }
    const r = evaluateBookingConflicts(
      attempt({ travelDate: '2026-07-10', travellerNames: ['User A', 'User B'], selfName: 'Subodh', startMs: D('2026-07-10'), endMs: D('2026-07-15') }),
      [existingFriends],
    )
    expect(r.prevent).toMatch(/exact booking/i)
  })

  it('#3 non-self overlap → warn (allow proceed)', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['User B', 'User C', 'User D'] }), [existingX])
    expect(r.prevent).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/already booked this trip for user b/i)
  })

  it('#4 date overlap on a different trip → warn', () => {
    const r = evaluateBookingConflicts(
      attempt({ packageId: 'Y', travelDate: '2026-07-13', travellerNames: ['User C'], startMs: D('2026-07-13'), endMs: D('2026-07-20') }),
      [existingX],
    )
    expect(r.prevent).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/during these dates/i)
  })

  it('#5a same trip + same departure, all-new travellers → warn', () => {
    const r = evaluateBookingConflicts(
      attempt({ travelDate: '2026-07-10', travellerNames: ['User C'], startMs: D('2026-07-10'), endMs: D('2026-07-15') }),
      [existingX],
    )
    // overlaps the existing date range too, so both date + departure warnings may apply
    expect(r.prevent).toBeUndefined()
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings.join(' ')).toMatch(/departure date/i)
  })

  it('no existing bookings → allow', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['Subodh', 'User A'] }), [])
    expect(r.prevent).toBeUndefined()
    expect(r.warnings).toEqual([])
  })

  it('name matching is case/space-insensitive', () => {
    const r = evaluateBookingConflicts(attempt({ travellerNames: ['  user b ', 'New'] }), [existingX])
    expect(r.warnings.join(' ')).toMatch(/user b/i)
  })
})
