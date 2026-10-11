import { listingScheduleTodayISO } from '@/lib/utils'

export type TripDeparturePair = { dep: string; ret: string }
export type TripDepartureFrequency = 'daily' | 'weekly' | 'monthly'
export type RecurringTripDepartures = {
  frequency: TripDepartureFrequency
  startDate: string
  firstReturnDate: string
  untilDate: string
  /** JavaScript weekday numbers: Sunday = 0, Saturday = 6. */
  weekdays?: number[]
  monthDays?: number[]
}

const DAY_MS = 86400000
// Two years of daily departures, including endpoints and leap days.
export const MAX_TRIP_DEPARTURES = 732

function calendarDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Enter a valid calendar date')
  const date = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error('Enter a valid calendar date')
  }
  return date
}

export function addTripCalendarDays(iso: string, days: number): string {
  const date = calendarDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** India calendar, with leap-day clamping rather than rolling into March. */
export function tripScheduleMaxDate(today: string = listingScheduleTodayISO()): string {
  const date = calendarDate(today)
  const year = date.getUTCFullYear() + 2
  const month = date.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay))).toISOString().slice(0, 10)
}

function selections(values: number[] | undefined, min: number, max: number, label: string): Set<number> {
  if (!values?.length) throw new Error(`Select at least one ${label}`)
  if (values.some((value) => !Number.isInteger(value) || value < min || value > max)) {
    throw new Error(`Invalid ${label} selection`)
  }
  return new Set(values)
}

/** UTC date-only math avoids DST drift and local-time shifts in saved dates. */
export function generateRecurringTripDepartures(
  input: RecurringTripDepartures,
  today: string = listingScheduleTodayISO(),
): TripDeparturePair[] {
  const start = calendarDate(input.startDate)
  const firstReturn = calendarDate(input.firstReturnDate)
  const until = calendarDate(input.untilDate)
  const maxDate = tripScheduleMaxDate(today)
  if (input.startDate < today) throw new Error('Departure date cannot be in the past')
  if (input.firstReturnDate < input.startDate) throw new Error('Return date must be on or after departure')
  if (input.untilDate < input.startDate) throw new Error('Repeat through must be on or after the first departure')
  if (input.untilDate > maxDate || input.firstReturnDate > maxDate) {
    throw new Error('Schedule dates must be within the next two years')
  }
  if (!['daily', 'weekly', 'monthly'].includes(input.frequency)) throw new Error('Choose a valid departure frequency')
  const weekdays = input.frequency === 'weekly' ? selections(input.weekdays, 0, 6, 'day of the week') : null
  const monthDays = input.frequency === 'monthly' ? selections(input.monthDays, 1, 31, 'date of the month') : null
  const offset = (firstReturn.getTime() - start.getTime()) / DAY_MS
  const pairs: TripDeparturePair[] = []
  for (let time = start.getTime(); time <= until.getTime(); time += DAY_MS) {
    const date = new Date(time)
    if (weekdays && !weekdays.has(date.getUTCDay())) continue
    if (monthDays && !monthDays.has(date.getUTCDate())) continue
    const dep = date.toISOString().slice(0, 10)
    const ret = addTripCalendarDays(dep, offset)
    if (ret > maxDate) throw new Error('A generated return date exceeds the two-year limit. Choose an earlier repeat-through date.')
    pairs.push({ dep, ret })
    if (pairs.length > MAX_TRIP_DEPARTURES) throw new Error(`A trip can have at most ${MAX_TRIP_DEPARTURES} departures`)
  }
  if (!pairs.length) throw new Error('No departures match your selections in this date range')
  return pairs
}

/** Ignore completely blank placeholders, reject partial dates, sort paired rows,
 * and collapse duplicates only when their return dates agree. Past dates remain
 * valid here so editing existing trips does not erase booking history. */
export function normalizeTripDeparturePairs(rows: TripDeparturePair[]): TripDeparturePair[] {
  if (rows.length > MAX_TRIP_DEPARTURES) throw new Error(`A trip can have at most ${MAX_TRIP_DEPARTURES} departures`)
  const byDeparture = new Map<string, string>()
  for (const row of rows) {
    if (!row.dep && !row.ret) continue
    if (!row.dep || !row.ret) throw new Error('Enter both departure and return dates for every row')
    calendarDate(row.dep)
    calendarDate(row.ret)
    if (row.ret < row.dep) throw new Error('Return date must be on or after departure for every row')
    const existing = byDeparture.get(row.dep)
    if (existing && existing !== row.ret) throw new Error(`Departure ${row.dep} has different return dates. Remove the conflicting row first.`)
    byDeparture.set(row.dep, row.ret)
  }
  return [...byDeparture].sort(([a], [b]) => a.localeCompare(b)).map(([dep, ret]) => ({ dep, ret }))
}

export function mergeTripDepartures(existing: TripDeparturePair[], generated: TripDeparturePair[]): TripDeparturePair[] {
  // Remove placeholders before checking the combined size. Deduplicate before
  // applying the cap so re-adding the same full daily schedule remains safe.
  const pairs = new Map(normalizeTripDeparturePairs(existing).map((row) => [row.dep, row.ret]))
  for (const row of normalizeTripDeparturePairs(generated)) {
    const ret = pairs.get(row.dep)
    if (ret && ret !== row.ret) throw new Error(`Departure ${row.dep} has different return dates. Remove the conflicting row first.`)
    pairs.set(row.dep, row.ret)
  }
  return normalizeTripDeparturePairs([...pairs].map(([dep, ret]) => ({ dep, ret })))
}