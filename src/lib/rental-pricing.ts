/**
 * Optional rental rate options (24-hour / daytime) and refundable security
 * deposit. Pure helpers shared by the listing forms, booking UI and server
 * pricing so the price a traveller sees is the price they are charged.
 */

export type RentalRateOption = 'standard' | 'full_day' | 'daytime'

export type RentalItemPricing = {
  price_paise: number
  unit?: string | null
  full_day_price_paise?: number | null
  daytime_price_paise?: number | null
  daytime_start?: string | null
  daytime_end?: string | null
  security_deposit_paise?: number | null
}

export type RentalRateChoice = {
  option: RentalRateOption
  pricePaise: number
  label: string
  /** Daytime window, e.g. { start: '06:00', end: '19:00' }. */
  window?: { start: string; end: string }
}

export const RENTAL_EXTRA_COLUMNS =
  'full_day_price_paise, daytime_price_paise, daytime_start, daytime_end, security_deposit_paise'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function formatRentalTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}

const UNIT_LABEL: Record<string, string> = {
  per_hour: 'Per hour', per_day: 'Per day', per_week: 'Per week', per_month: 'Per month', per_night: 'Per night', per_person: 'Per person',
}

/** Rate options a traveller can pick for an item: standard always, extras only when set. */
export function rentalRateChoices(item: RentalItemPricing): RentalRateChoice[] {
  const choices: RentalRateChoice[] = [{
    option: 'standard', pricePaise: item.price_paise, label: UNIT_LABEL[item.unit ?? 'per_day'] ?? 'Standard',
  }]
  if (item.full_day_price_paise && item.full_day_price_paise > 0) {
    choices.push({ option: 'full_day', pricePaise: item.full_day_price_paise, label: '24 hours' })
  }
  if (item.daytime_price_paise && item.daytime_price_paise > 0 && item.daytime_start && item.daytime_end) {
    choices.push({
      option: 'daytime', pricePaise: item.daytime_price_paise,
      label: `Daytime (${formatRentalTime(item.daytime_start)} – ${formatRentalTime(item.daytime_end)})`,
      window: { start: item.daytime_start, end: item.daytime_end },
    })
  }
  return choices
}

/**
 * Rental charge for one cart line. `periods` is the number of days/units booked
 * (each 24-hour or daytime period counts as one). The deposit is per unit,
 * charged once regardless of duration, and kept separate from the rental charge.
 */
export function quoteRentalLine(
  item: RentalItemPricing,
  option: RentalRateOption | undefined,
  quantity: number,
  periods: number,
): { error: string } | { option: RentalRateOption; unitPaise: number; rentalPaise: number; depositPaise: number; window?: { start: string; end: string } } {
  const choice = rentalRateChoices(item).find(c => c.option === (option ?? 'standard'))
  if (!choice) return { error: 'This rate is not offered for the selected item' }
  const qty = Math.max(1, Math.floor(quantity))
  const count = Math.max(1, Math.floor(periods))
  return {
    option: choice.option,
    unitPaise: choice.pricePaise,
    rentalPaise: choice.pricePaise * qty * count,
    depositPaise: Math.max(0, item.security_deposit_paise ?? 0) * qty,
    window: choice.window,
  }
}

export type RentalExtrasInput = {
  fullDayPricePaise?: number | null
  daytimePricePaise?: number | null
  daytimeStart?: string | null
  daytimeEnd?: string | null
  securityDepositPaise?: number | null
}

/** Validates optional extras; returns the DB row fields with only the extras that were added. */
export function rentalExtrasRow(input: RentalExtrasInput): { error: string } | Record<string, number | string> {
  const row: Record<string, number | string> = {}
  if (input.fullDayPricePaise != null) {
    if (!(input.fullDayPricePaise > 0)) return { error: '24-hour price must be greater than 0' }
    row.full_day_price_paise = Math.round(input.fullDayPricePaise)
  }
  const anyDaytime = input.daytimePricePaise != null || !!input.daytimeStart || !!input.daytimeEnd
  if (anyDaytime) {
    if (!(input.daytimePricePaise != null && input.daytimePricePaise > 0)) return { error: 'Daytime price must be greater than 0' }
    if (!input.daytimeStart || !input.daytimeEnd || !TIME_RE.test(input.daytimeStart) || !TIME_RE.test(input.daytimeEnd)) {
      return { error: 'Enter the daytime start and end time' }
    }
    if (input.daytimeStart >= input.daytimeEnd) return { error: 'Daytime end must be after the start time' }
    row.daytime_price_paise = Math.round(input.daytimePricePaise)
    row.daytime_start = input.daytimeStart
    row.daytime_end = input.daytimeEnd
  }
  if (input.securityDepositPaise != null) {
    if (!(input.securityDepositPaise > 0)) return { error: 'Security deposit must be greater than 0' }
    row.security_deposit_paise = Math.round(input.securityDepositPaise)
  }
  return row
}

/** All extras cleared — used when editing so removed options are nulled in the DB. */
export const CLEARED_RENTAL_EXTRAS = {
  full_day_price_paise: null, daytime_price_paise: null, daytime_start: null, daytime_end: null, security_deposit_paise: null,
} as const

export function hasRentalExtras(row: Record<string, unknown>): boolean {
  return Object.keys(CLEARED_RENTAL_EXTRAS).some(k => row[k] != null)
}

/**
 * Form draft for extras: a key is present only once the host has added that
 * option (its value may still be blank while typing). Absent = not offered.
 */
export type RentalExtrasDraft = {
  fullDayPriceRupees?: number | null
  daytimePriceRupees?: number | null
  daytimeStart?: string
  daytimeEnd?: string
  securityDepositRupees?: number | null
}

const toPaise = (rupees: number | null | undefined) => Math.round((rupees ?? 0) * 100)

/** An added-but-blank option becomes 0 so validation asks the host to fill or remove it. */
export function rentalExtrasInputFromDraft(d: RentalExtrasDraft | undefined): RentalExtrasInput {
  if (!d) return {}
  const daytime = 'daytimePriceRupees' in d
  return {
    fullDayPricePaise: 'fullDayPriceRupees' in d ? toPaise(d.fullDayPriceRupees) : null,
    daytimePricePaise: daytime ? toPaise(d.daytimePriceRupees) : null,
    daytimeStart: daytime ? d.daytimeStart || '' : null,
    daytimeEnd: daytime ? d.daytimeEnd || '' : null,
    securityDepositPaise: 'securityDepositRupees' in d ? toPaise(d.securityDepositRupees) : null,
  }
}

export function rentalExtrasDraftFromRow(row: Partial<RentalItemPricing>): RentalExtrasDraft {
  const d: RentalExtrasDraft = {}
  if (row.full_day_price_paise != null) d.fullDayPriceRupees = row.full_day_price_paise / 100
  if (row.daytime_price_paise != null) {
    d.daytimePriceRupees = row.daytime_price_paise / 100
    d.daytimeStart = row.daytime_start ?? ''
    d.daytimeEnd = row.daytime_end ?? ''
  }
  if (row.security_deposit_paise != null) d.securityDepositRupees = row.security_deposit_paise / 100
  return d
}
