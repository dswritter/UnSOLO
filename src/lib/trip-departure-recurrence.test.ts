import { describe, expect, it } from 'vitest'
import {
  addTripCalendarDays,
  generateRecurringTripDepartures,
  mergeTripDepartures,
  normalizeTripDeparturePairs,
  tripScheduleMaxDate,
  type RecurringTripDepartures,
} from './trip-departure-recurrence'
import { tripEndDateIsoForBooking } from './package-trip-calendar'
import { emptyHostTripCreateDraftFields } from './host-trip-create-draft'

const today = '2026-10-12'
const daily: RecurringTripDepartures = {
  frequency: 'daily', startDate: '2026-10-12', firstReturnDate: '2026-10-14', untilDate: '2026-10-15',
}
const generate = (patch: Partial<RecurringTripDepartures> = {}) => generateRecurringTripDepartures({ ...daily, ...patch }, today)

describe('recurring trip departures', () => {
  it('generates daily departures inclusively with the same return offset', () => {
    expect(generate()).toEqual([
      { dep: '2026-10-12', ret: '2026-10-14' }, { dep: '2026-10-13', ret: '2026-10-15' },
      { dep: '2026-10-14', ret: '2026-10-16' }, { dep: '2026-10-15', ret: '2026-10-17' },
    ])
  })
  it('supports same-day trips', () => {
    expect(generate({ firstReturnDate: '2026-10-12' }).every((pair) => pair.dep === pair.ret)).toBe(true)
  })
  it('supports one selected weekday with inclusive endpoints', () => {
    expect(generate({ frequency: 'weekly', weekdays: [1], untilDate: '2026-10-26' }).map((p) => p.dep))
      .toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
  })
  it('supports multiple weekdays and deduplicates selections', () => {
    expect(generate({ frequency: 'weekly', weekdays: [0, 6, 6], untilDate: '2026-10-25' }).map((p) => p.dep))
      .toEqual(['2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25'])
  })
  it('starts on the first matching weekday without changing trip length', () => {
    expect(generate({ frequency: 'weekly', weekdays: [5], untilDate: '2026-10-16' }))
      .toEqual([{ dep: '2026-10-16', ret: '2026-10-18' }])
  })
  it('supports multiple dates of each month and partial first/last months', () => {
    expect(generate({ frequency: 'monthly', monthDays: [1, 15, 28], untilDate: '2026-12-15' }).map((p) => p.dep))
      .toEqual(['2026-10-15', '2026-10-28', '2026-11-01', '2026-11-15', '2026-11-28', '2026-12-01', '2026-12-15'])
  })
  it('skips nonexistent monthly dates instead of moving them into the next month', () => {
    expect(generate({ frequency: 'monthly', monthDays: [31], untilDate: '2027-03-31' }).map((p) => p.dep))
      .toEqual(['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31'])
  })
  it('handles leap February and return dates across month/year boundaries', () => {
    expect(generate({ frequency: 'monthly', startDate: '2028-01-29', firstReturnDate: '2028-01-31', monthDays: [29], untilDate: '2028-03-29' }))
      .toEqual([{ dep: '2028-01-29', ret: '2028-01-31' }, { dep: '2028-02-29', ret: '2028-03-02' }, { dep: '2028-03-29', ret: '2028-03-31' }])
    expect(generate({ startDate: '2026-12-31', firstReturnDate: '2027-01-02', untilDate: '2027-01-01' }).at(-1))
      .toEqual({ dep: '2027-01-01', ret: '2027-01-03' })
  })
  it('does not drift across DST transitions', () => {
    expect(generate({ startDate: '2026-10-31', firstReturnDate: '2026-11-01', untilDate: '2026-11-02' }))
      .toEqual([{ dep: '2026-10-31', ret: '2026-11-01' }, { dep: '2026-11-01', ret: '2026-11-02' }, { dep: '2026-11-02', ret: '2026-11-03' }])
  })
  it('allows the full two-year daily schedule for day trips', () => {
    const pairs = generate({ firstReturnDate: today, untilDate: tripScheduleMaxDate(today) })
    expect(pairs).toHaveLength(732)
    expect(pairs.at(-1)?.dep).toBe('2028-10-12')
    expect(mergeTripDepartures(pairs, pairs)).toEqual(pairs)
  })
  it('clamps leap-day horizons to February rather than rolling into March', () => {
    expect(tripScheduleMaxDate('2028-02-29')).toBe('2030-02-28')
  })
  it.each([
    { startDate: '' }, { startDate: '2026-02-30' }, { firstReturnDate: 'bad' }, { untilDate: '2027-02-29' },
    { startDate: '2026-10-11' }, { firstReturnDate: '2026-10-11' }, { untilDate: '2026-10-11' },
    { untilDate: '2028-10-13' }, { firstReturnDate: '2028-10-13' }, { untilDate: '2028-10-12' },
    { frequency: 'weekly' as const, weekdays: [] }, { frequency: 'weekly' as const, weekdays: [-1] },
    { frequency: 'weekly' as const, weekdays: [7] }, { frequency: 'weekly' as const, weekdays: [1.5] },
    { frequency: 'monthly' as const, monthDays: [] }, { frequency: 'monthly' as const, monthDays: [0] },
    { frequency: 'monthly' as const, monthDays: [32] },
    { frequency: 'monthly' as const, monthDays: [31], untilDate: '2026-10-15' },
  ])('rejects invalid/unbounded/empty recurrence %j', (patch) => {
    expect(() => generate(patch)).toThrow()
  })
  it('keeps generated return dates compatible with the existing booking calendar', () => {
    const pairs = generate({ frequency: 'weekly', weekdays: [5], untilDate: '2026-11-01' })
    const pkg = { duration_days: 3, departure_dates: pairs.map((p) => p.dep), return_dates: pairs.map((p) => p.ret) }
    for (const pair of pairs) expect(tripEndDateIsoForBooking(pair.dep, pkg)).toBe(pair.ret)
  })
  it('retains generated dates in the existing serializable draft payload', () => {
    const draft = { ...emptyHostTripCreateDraftFields(), scheduleRows: generate() }
    expect(JSON.parse(JSON.stringify(draft)).scheduleRows).toEqual(generate())
  })
})

describe('explicit departure schedule integrity', () => {
  it('ignores blank placeholders, sorts dates and keeps paired returns', () => {
    expect(normalizeTripDeparturePairs([{ dep: '2026-10-15', ret: '2026-10-17' }, { dep: '', ret: '' },
      { dep: '2026-10-12', ret: '2026-10-14' }, { dep: '2026-10-12', ret: '2026-10-14' }]))
      .toEqual([{ dep: '2026-10-12', ret: '2026-10-14' }, { dep: '2026-10-15', ret: '2026-10-17' }])
  })
  it('merges manual and generated schedules without duplicate departures', () => {
    const manual = [{ dep: '2026-10-12', ret: '2026-10-14' }, { dep: '2026-11-01', ret: '2026-11-03' }]
    expect(mergeTripDepartures(manual, generate()).map((p) => p.dep))
      .toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-11-01'])
  })
  it('rejects duplicates with different return dates rather than overwriting', () => {
    expect(() => mergeTripDepartures([{ dep: today, ret: '2026-10-15' }], generate())).toThrow('different return dates')
  })
  it.each([
    [{ dep: today, ret: '' }], [{ dep: '', ret: today }], [{ dep: today, ret: '2026-10-11' }],
    [{ dep: '2026-02-30', ret: '2026-03-01' }], Array.from({ length: 733 }, () => ({ dep: today, ret: today })),
  ])('rejects invalid pairs or excessive rows', (rows) => {
    expect(() => normalizeTripDeparturePairs(rows)).toThrow()
  })
  it('preserves existing past dates during edits', () => {
    expect(normalizeTripDeparturePairs([{ dep: '2025-01-01', ret: '2025-01-02' }]))
      .toEqual([{ dep: '2025-01-01', ret: '2025-01-02' }])
  })
  it('adds date-only days across leap and year boundaries', () => {
    expect(addTripCalendarDays('2028-02-28', 2)).toBe('2028-03-01')
    expect(addTripCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})