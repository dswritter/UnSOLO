import { describe, expect, it } from 'vitest'
import { quoteRentalLine, rentalExtrasRow, rentalRateChoices } from './rental-pricing'

const bike = {
  price_paise: 130000, unit: 'per_day', full_day_price_paise: 160000,
  daytime_price_paise: 75000, daytime_start: '08:00', daytime_end: '21:00', security_deposit_paise: 200000,
}

describe('rental rate options', () => {
  it('offers only the standard rate until extras are added', () => {
    expect(rentalRateChoices({ price_paise: 50000, unit: 'per_hour' }).map(c => c.label)).toEqual(['Per hour'])
  })
  it('lists 24-hour and daytime rates with the time window', () => {
    expect(rentalRateChoices(bike).map(c => c.label)).toEqual(['Per day', '24 hours', 'Daytime (8 AM – 9 PM)'])
  })
  it('prices the chosen rate per period and keeps the deposit separate, per unit', () => {
    expect(quoteRentalLine(bike, 'full_day', 2, 3)).toMatchObject({ rentalPaise: 160000 * 2 * 3, depositPaise: 400000 })
    expect(quoteRentalLine(bike, 'daytime', 1, 1)).toMatchObject({ rentalPaise: 75000, window: { start: '08:00', end: '21:00' } })
    expect(quoteRentalLine(bike, undefined, 1, 2)).toMatchObject({ option: 'standard', rentalPaise: 260000 })
  })
  it('rejects a rate the item does not offer', () => {
    expect(quoteRentalLine({ price_paise: 100 }, 'daytime', 1, 1)).toEqual({ error: 'This rate is not offered for the selected item' })
  })
})

describe('rental extras validation', () => {
  it('stores only extras that were added', () => {
    expect(rentalExtrasRow({})).toEqual({})
    expect(rentalExtrasRow({ securityDepositPaise: 200000 })).toEqual({ security_deposit_paise: 200000 })
  })
  it('requires a complete, ordered daytime window', () => {
    expect(rentalExtrasRow({ daytimePricePaise: 75000, daytimeStart: '08:00' })).toEqual({ error: 'Enter the daytime start and end time' })
    expect(rentalExtrasRow({ daytimePricePaise: 75000, daytimeStart: '21:00', daytimeEnd: '08:00' })).toEqual({ error: 'Daytime end must be after the start time' })
    expect(rentalExtrasRow({ daytimePricePaise: 75000, daytimeStart: '08:00', daytimeEnd: '21:00' }))
      .toEqual({ daytime_price_paise: 75000, daytime_start: '08:00', daytime_end: '21:00' })
  })
  it('rejects zero or negative amounts', () => {
    expect(rentalExtrasRow({ fullDayPricePaise: 0 })).toEqual({ error: '24-hour price must be greater than 0' })
    expect(rentalExtrasRow({ securityDepositPaise: -1 })).toEqual({ error: 'Security deposit must be greater than 0' })
  })
})
