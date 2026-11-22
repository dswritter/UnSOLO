import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/http'
import {
  HOST_TRIP_OPERATIONAL_FIELDS,
  fieldChanged,
  hasSubstantiveChange,
  pruneToDepartures,
  rowToTripForm,
  tripFormToRow,
  tripSlug,
  validateTripForm,
  type TripForm,
  type TripFormRules,
} from './trip-form'

const PREFIX = 'https://x.supabase.co/storage/v1/object/public/images/'
const RULES: TripFormRules = { today: '2026-11-22', maxGroupSize: 50, storagePrefix: PREFIX }

function form(over: Partial<TripForm> = {}): TripForm {
  return {
    title: 'Spiti Winter Road Trip',
    destinationId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
    shortDescription: 'Snow and monasteries',
    description: '## Day 1\nDrive up.',
    searchKeywords: 'spiti, snow, Spiti',
    meetingAddress: 'Manali bus stand',
    meetingPoint: { lat: 32.24, lon: 77.19, label: 'Manali' },
    pricePaise: 1_500_000,
    compareAtPaise: null,
    priceVariants: [],
    tripDays: 6,
    tripNights: 5,
    excludeFirstDayTravel: true,
    departureTime: 'morning',
    returnTime: 'evening',
    maxGroupSize: 12,
    difficulty: 'moderate',
    departures: [
      { date: '2026-12-20', returnDate: '2026-12-25' },
      { date: '2026-12-05', returnDate: '2026-12-10' },
    ],
    includes: ['Stay', 'Meals', 'Stay'],
    images: [`${PREFIX}host-trips/u/a.webp`, `${PREFIX}host-trips/u/b.webp`],
    joinPreferences: { paymentTiming: 'after_host_approval', tokenDepositEnabled: false },
    ...over,
  }
}

function errorOf(fn: () => unknown): ApiError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected an ApiError')
}

describe('validateTripForm', () => {
  it('accepts a valid form, sorts departures and derives the span', () => {
    const v = validateTripForm(form(), RULES)
    expect(v.pairs).toEqual([{ dep: '2026-12-05', ret: '2026-12-10' }, { dep: '2026-12-20', ret: '2026-12-25' }])
    expect(v.durationDays).toBe(6)
    expect(v.includes).toEqual(['Stay', 'Meals'])
    expect(v.tiers).toBeNull()
  })

  it('checks lengths and required fields with the field path', () => {
    expect(errorOf(() => validateTripForm(form({ title: '  ' }), RULES)).extra.field).toBe('title')
    expect(errorOf(() => validateTripForm(form({ title: 'x'.repeat(101) }), RULES)).extra.field).toBe('title')
    expect(errorOf(() => validateTripForm(form({ shortDescription: 'x'.repeat(151) }), RULES)).extra.field).toBe('shortDescription')
    expect(errorOf(() => validateTripForm(form({ description: '' }), RULES)).extra.field).toBe('description')
    expect(errorOf(() => validateTripForm(form({ destinationId: 'nope' }), RULES)).extra.field).toBe('destinationId')
    expect(errorOf(() => validateTripForm(form({ includes: ['x'.repeat(61)] }), RULES)).extra.field).toBe('includes.0')
    expect(errorOf(() => validateTripForm(form({ images: [] }), RULES)).extra.field).toBe('images')
  })

  describe('pricing', () => {
    it('rejects a price under ₹1', () => {
      expect(errorOf(() => validateTripForm(form({ pricePaise: 99 }), RULES)).extra.field).toBe('pricePaise')
    })

    it('needs compare-at above the price, and saves it', () => {
      expect(errorOf(() => validateTripForm(form({ compareAtPaise: 1_500_000 }), RULES)).extra.field).toBe('compareAtPaise')
      const v = validateTripForm(form({ compareAtPaise: 1_800_000 }), RULES)
      expect(tripFormToRow(v).compare_at_price_paise).toBe(1_800_000)
    })

    it('rejects a single tier and uses the cheapest of 2+ tiers as the price', () => {
      const one = [{ description: 'Dorm', pricePaise: 900_000 }]
      expect(errorOf(() => validateTripForm(form({ priceVariants: one }), RULES)).extra.field).toBe('priceVariants')
      const v = validateTripForm(form({
        pricePaise: 5_000_000,
        compareAtPaise: 9_000_000,
        priceVariants: [
          { description: 'Twin sharing', pricePaise: 1_400_000, compareAtPaise: 1_600_000 },
          { description: 'Triple sharing', pricePaise: 1_200_000 },
        ],
      }), RULES)
      expect(v.pricePaise).toBe(1_200_000)
      const row = tripFormToRow(v)
      expect(row.price_paise).toBe(1_200_000)
      expect(row.compare_at_price_paise).toBeNull()
      expect(row.price_variants).toEqual([
        { description: 'Twin sharing', price_paise: 1_400_000, compare_at_paise: 1_600_000 },
        { description: 'Triple sharing', price_paise: 1_200_000 },
      ])
    })

    it('checks tier compare-at, tier count and descriptions', () => {
      const tiers = [{ description: 'A', pricePaise: 1000, compareAtPaise: 1000 }, { description: 'B', pricePaise: 2000 }]
      expect(errorOf(() => validateTripForm(form({ priceVariants: tiers }), RULES)).extra.field).toBe('priceVariants.0.compareAtPaise')
      const eleven = Array.from({ length: 11 }, (_, i) => ({ description: `T${i}`, pricePaise: 1000 + i }))
      expect(errorOf(() => validateTripForm(form({ priceVariants: eleven }), RULES)).extra.field).toBe('priceVariants')
      const blank = [{ description: ' ', pricePaise: 1000 }, { description: 'B', pricePaise: 2000 }]
      expect(errorOf(() => validateTripForm(form({ priceVariants: blank }), RULES)).extra.field).toBe('priceVariants.0.description')
    })
  })

  describe('token deposit', () => {
    const token = (amount: number | null, extra: Partial<TripForm> = {}) =>
      form({ ...extra, joinPreferences: { paymentTiming: 'pay_on_booking', tokenDepositEnabled: true, tokenAmountPaise: amount } })

    it('needs an amount of at least ₹1', () => {
      expect(errorOf(() => validateTripForm(token(null), RULES)).extra.field).toBe('joinPreferences.tokenAmountPaise')
      expect(errorOf(() => validateTripForm(token(50), RULES)).extra.field).toBe('joinPreferences.tokenAmountPaise')
    })

    it('can’t exceed the price, or the cheapest tier', () => {
      expect(errorOf(() => validateTripForm(token(1_500_001), RULES)).message).toMatch(/cannot exceed/)
      expect(validateTripForm(token(1_500_000), RULES).joinPreferences.tokenAmountPaise).toBe(1_500_000)
      const tiers = { priceVariants: [{ description: 'A', pricePaise: 300_000 }, { description: 'B', pricePaise: 900_000 }] }
      expect(errorOf(() => validateTripForm(token(500_000, tiers), RULES)).extra.field).toBe('joinPreferences.tokenAmountPaise')
      expect(validateTripForm(token(300_000, tiers), RULES).joinPreferences.tokenAmountPaise).toBe(300_000)
    })

    it('is ignored when switched off', () => {
      const v = validateTripForm(form({ joinPreferences: { paymentTiming: 'pay_on_booking', tokenDepositEnabled: false, tokenAmountPaise: 99_999_999 } }), RULES)
      expect(tripFormToRow(v).join_preferences).toEqual({ payment_timing: 'pay_on_booking' })
    })
  })

  describe('departures', () => {
    const deps = (d: TripForm['departures']) => form({ departures: d })

    it('needs real dates with the return on or after departure', () => {
      expect(errorOf(() => validateTripForm(deps([{ date: '2026-02-30', returnDate: '2026-03-02' }]), { ...RULES, today: '2026-01-01' })).extra.field).toBe('departures.0.date')
      expect(errorOf(() => validateTripForm(deps([{ date: '2026-12-05', returnDate: '05/12/2026' }]), RULES)).extra.field).toBe('departures.0.returnDate')
      expect(errorOf(() => validateTripForm(deps([{ date: '2026-12-05', returnDate: '2026-12-04' }]), RULES)).extra.field).toBe('departures.0.returnDate')
      expect(validateTripForm(deps([{ date: '2026-12-05', returnDate: '2026-12-05' }]), RULES).durationDays).toBe(1)
    })

    it('rejects duplicates and an empty list', () => {
      const dup = [{ date: '2026-12-05', returnDate: '2026-12-08' }, { date: '2026-12-05', returnDate: '2026-12-08' }]
      expect(errorOf(() => validateTripForm(deps(dup), RULES)).extra.field).toBe('departures.1.date')
      expect(errorOf(() => validateTripForm(deps([]), RULES)).extra.field).toBe('departures')
    })

    it('rejects new past dates but keeps past dates already on the trip', () => {
      const past = [{ date: '2026-11-01', returnDate: '2026-11-04' }, { date: '2026-12-05', returnDate: '2026-12-08' }]
      expect(errorOf(() => validateTripForm(deps(past), RULES)).message).toMatch(/past/)
      const existing = { departure_dates: ['2026-11-01', '2026-12-01'], images: [] }
      expect(validateTripForm(deps(past), { ...RULES, existing }).pairs[0].dep).toBe('2026-11-01')
      expect(validateTripForm(deps([{ date: '2026-11-22', returnDate: '2026-11-24' }]), RULES).pairs).toHaveLength(1)
    })
  })

  describe('days and nights', () => {
    it('allows 1–60 days and 0–60 nights', () => {
      expect(validateTripForm(form({ tripDays: 1, tripNights: 0 }), RULES).tripNights).toBe(0)
      expect(errorOf(() => validateTripForm(form({ tripDays: 0 }), RULES)).extra.field).toBe('tripDays')
      expect(errorOf(() => validateTripForm(form({ tripDays: 61 }), RULES)).extra.field).toBe('tripDays')
      expect(errorOf(() => validateTripForm(form({ tripNights: -1 }), RULES)).extra.field).toBe('tripNights')
      expect(errorOf(() => validateTripForm(form({ tripDays: 2.5 }), RULES)).extra.field).toBe('tripDays')
    })
  })

  it('caps the group size at the platform max unless the trip already had that size', () => {
    expect(errorOf(() => validateTripForm(form({ maxGroupSize: 1 }), RULES)).extra.field).toBe('maxGroupSize')
    expect(errorOf(() => validateTripForm(form({ maxGroupSize: 51 }), RULES)).extra.field).toBe('maxGroupSize')
    expect(validateTripForm(form({ maxGroupSize: 60 }), { ...RULES, existing: { max_group_size: 60 } }).maxGroupSize).toBe(60)
  })

  it('accepts our storage photos only, plus ones already on the trip', () => {
    const outside = 'https://images.unsplash.com/photo-1'
    expect(errorOf(() => validateTripForm(form({ images: [outside] }), RULES)).extra.field).toBe('images.0')
    expect(validateTripForm(form({ images: [outside] }), { ...RULES, existing: { images: [outside] } }).images).toEqual([outside])
    const a = `${PREFIX}a.webp`
    expect(errorOf(() => validateTripForm(form({ images: [a, a] }), RULES)).extra.field).toBe('images')
  })

  it('checks ages and interest tags', () => {
    const jp = (p: Partial<TripForm['joinPreferences']>) => form({ joinPreferences: { paymentTiming: 'after_host_approval', tokenDepositEnabled: false, ...p } })
    expect(errorOf(() => validateTripForm(jp({ minAge: 17 }), RULES)).extra.field).toBe('joinPreferences.minAge')
    expect(errorOf(() => validateTripForm(jp({ minAge: 40, maxAge: 30 }), RULES)).extra.field).toBe('joinPreferences.maxAge')
    expect(errorOf(() => validateTripForm(jp({ interestTags: ['Trekking', 'Knitting'] }), RULES)).extra.field).toBe('joinPreferences.interestTags.1')
    expect(validateTripForm(jp({ interestTags: ['Trekking', 'Trekking'] }), RULES).joinPreferences.interestTags).toEqual(['Trekking'])
  })
})

describe('tripFormToRow / rowToTripForm', () => {
  it('writes the web columns and keeps other metadata keys', () => {
    const row = tripFormToRow(validateTripForm(form({ joinPreferences: { paymentTiming: 'after_host_approval', tokenDepositEnabled: true, tokenAmountPaise: 200_000, genderPreference: 'all', minAge: 21 } }), RULES), { legacy: 1, meeting_address: 'old' })
    expect(row).toMatchObject({
      title: 'Spiti Winter Road Trip',
      short_description: 'Snow and monasteries',
      duration_days: 6,
      trip_days: 6,
      trip_nights: 5,
      departure_dates: ['2026-12-05', '2026-12-20'],
      return_dates: ['2026-12-10', '2026-12-25'],
      includes: ['Stay', 'Meals'],
    })
    expect(row.metadata).toEqual({ legacy: 1, search_keywords: ['spiti', 'snow'], meeting_address: 'Manali bus stand', meeting_point: { lat: 32.24, lon: 77.19, label: 'Manali' } })
    expect(row.join_preferences).toEqual({ payment_timing: 'after_host_approval', token_deposit_enabled: true, token_amount_paise: 200_000, min_age: 21 })
  })

  it('round-trips through a row', () => {
    const v = validateTripForm(form({ compareAtPaise: 2_000_000 }), RULES)
    const back = rowToTripForm({ ...tripFormToRow(v), id: 'x' })
    expect(back).toMatchObject({
      title: v.title,
      pricePaise: 1_500_000,
      compareAtPaise: 2_000_000,
      priceVariants: [],
      searchKeywords: 'spiti, snow',
      departures: [{ date: '2026-12-05', returnDate: '2026-12-10' }, { date: '2026-12-20', returnDate: '2026-12-25' }],
      joinPreferences: { paymentTiming: 'after_host_approval', tokenDepositEnabled: false, tokenAmountPaise: null, genderPreference: null },
    })
    expect(validateTripForm(back, { ...RULES, existing: tripFormToRow(v) }).pricePaise).toBe(1_500_000)
  })

  it('reads legacy rows (token_to_book, missing return dates, tiers)', () => {
    const f = rowToTripForm({
      title: 'Old', destination_id: 'd', description: 'x', price_paise: 500_000, compare_at_price_paise: 400_000,
      price_variants: [{ description: 'A', price_paise: 500_000 }, { description: 'B', price_paise: 700_000, compare_at_paise: 800_000 }],
      duration_days: 3, departure_dates: ['2027-01-10'], return_dates: null,
      join_preferences: { payment_timing: 'token_to_book', token_amount_paise: 100_000, gender_preference: 'all' },
    })
    expect(f.departures).toEqual([{ date: '2027-01-10', returnDate: '2027-01-12' }])
    expect(f.compareAtPaise).toBeNull()
    expect(f.priceVariants).toEqual([{ description: 'A', pricePaise: 500_000, compareAtPaise: null }, { description: 'B', pricePaise: 700_000, compareAtPaise: 800_000 }])
    expect(f.joinPreferences).toMatchObject({ paymentTiming: 'pay_on_booking', tokenDepositEnabled: true, tokenAmountPaise: 100_000, genderPreference: null })
    expect(f.tripDays).toBe(3)
  })
})

describe('operational-field detection', () => {
  const saved = () => ({ ...tripFormToRow(validateTripForm(form(), RULES)), id: 't', moderation_status: 'approved', departure_dates_closed: [] })

  it('ignores operational changes', () => {
    const next = tripFormToRow(validateTripForm(form({
      departures: [{ date: '2027-01-05', returnDate: '2027-01-12' }],
      tripDays: 8, tripNights: 7, maxGroupSize: 20, excludeFirstDayTravel: false, departureTime: 'evening', returnTime: 'morning',
    }), RULES))
    expect(hasSubstantiveChange(saved(), next)).toBe(false)
    expect(HOST_TRIP_OPERATIONAL_FIELDS.has('title')).toBe(false)
  })

  it('flags content, price, photos and preference changes', () => {
    const cases: Partial<TripForm>[] = [
      { title: 'New title' },
      { pricePaise: 1_400_000 },
      { compareAtPaise: 1_900_000 },
      { images: [`${PREFIX}host-trips/u/b.webp`, `${PREFIX}host-trips/u/a.webp`] },
      { includes: ['Stay'] },
      { meetingAddress: 'Somewhere else' },
      { joinPreferences: { paymentTiming: 'pay_on_booking', tokenDepositEnabled: false } },
    ]
    for (const c of cases) expect(hasSubstantiveChange(saved(), tripFormToRow(validateTripForm(form(c), RULES)))).toBe(true)
  })

  it('does not flag an unchanged form saved from a row with jsonb key order, nulls and blanks', () => {
    const row = saved()
    const stored = {
      ...row,
      short_description: 'Snow and monasteries',
      metadata: { meeting_point: { label: 'Manali', lon: 77.19, lat: 32.24 }, meeting_address: 'Manali bus stand', search_keywords: ['spiti', 'snow'], extra: null },
      join_preferences: { payment_timing: 'after_host_approval' },
      compare_at_price_paise: null,
      price_variants: null,
    }
    const again = tripFormToRow(validateTripForm(rowToTripForm(stored), { ...RULES, existing: stored }), stored.metadata)
    expect(hasSubstantiveChange(stored, again)).toBe(false)
  })

  it('treats empty values alike', () => {
    expect(fieldChanged(null, '')).toBe(false)
    expect(fieldChanged(undefined, [])).toBe(false)
    expect(fieldChanged({ a: 1, b: null }, { a: 1 })).toBe(false)
    expect(fieldChanged(0, null)).toBe(true)
  })
})

describe('pruneToDepartures', () => {
  it('keeps closed dates and cutoffs for remaining departures only', () => {
    const prev = { departure_dates_closed: ['2026-12-05', '2026-12-20'], booking_cutoff_dates: { '2026-12-05': '2026-12-01', '2026-12-20': '2026-12-15' } }
    expect(pruneToDepartures(prev, ['2026-12-20', '2027-01-01'])).toEqual({
      departure_dates_closed: ['2026-12-20'],
      booking_cutoff_dates: { '2026-12-20': '2026-12-15' },
    })
  })
})

describe('tripSlug', () => {
  it('slugifies the title (≤60) and adds a base36 time', () => {
    expect(tripSlug('Spiti: Winter  Road-Trip!', 36 ** 3)).toBe('spiti-winter-road-trip-1000')
    expect(tripSlug('x'.repeat(80), 1).length).toBe(62)
    expect(tripSlug('🙂', 1)).toBe('trip-1')
  })
})
