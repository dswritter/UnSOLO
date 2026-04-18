/** Calendar math and copy for packages with optional per-departure return_dates. */

/** Normalize DB/API date strings to YYYY-MM-DD for comparisons and closed-date sets. */
export function tripDepartureDateKey(isoOrDate: string): string {
  return String(isoOrDate).split('T')[0]
}

export type TripPackageCalendar = {
  duration_days: number
  departure_dates?: string[] | null
  return_dates?: string[] | null
}

export function inclusiveCalendarDaysBetween(departureIso: string, returnIso: string): number {
  const a = new Date(departureIso + 'T12:00:00').getTime()
  const b = new Date(returnIso + 'T12:00:00').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return Math.max(1,1)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

export function maxInclusiveSpanDays(pairs: { dep: string; ret: string }[]): number {
  let m = 1
  for (const p of pairs) {
    m = Math.max(m, inclusiveCalendarDaysBetween(p.dep, p.ret))
  }
  return m
}

export function tripEndDateIsoForBooking(travelDate: string, pkg: TripPackageCalendar): string {
  const rets = pkg.return_dates || []
  const deps = pkg.departure_dates || []
  const i = deps.indexOf(travelDate)
  if (i >= 0 && rets[i]) return rets[i]
  const d = new Date(travelDate + 'T12:00:00')
  d.setDate(d.getDate() + Math.max(0, pkg.duration_days - 1))
  return d.toISOString().slice(0, 10)
}

export function calendarInclusiveDaysForTravelDate(travelDate: string, pkg: TripPackageCalendar): number {
  const end = tripEndDateIsoForBooking(travelDate, pkg)
  return inclusiveCalendarDaysBetween(travelDate, end)
}

export function formatDateRangeFromEdges(departureDateStr: string, returnDateStr: string): string {
  const dep = new Date(departureDateStr + 'T00:00:00')
  const ret = new Date(returnDateStr + 'T00:00:00')
  const depStr = dep.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const retStr = ret.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${depStr} → ${retStr}`
}

export type PackageDurationDisplay = {
  duration_days: number
  trip_days?: number | null
  trip_nights?: number | null
  exclude_first_day_travel?: boolean | null
  departure_time?: string | null
  return_time?: string | null
}

/** Short label for cards / share (e.g. "3 days · 2 nights"). */
export function packageDurationShortLabel(p: PackageDurationDisplay): string {
  const d = p.trip_days ?? p.duration_days
  const n = p.trip_nights ?? Math.max(0, p.duration_days - 1)
  return `${d} day${d === 1 ? '' : 's'} · ${n} night${n === 1 ? '' : 's'}`
}

/** Longer label with times + optional travel-day note. */
export function packageDurationFullLabel(p: PackageDurationDisplay): string {
  let s = packageDurationShortLabel(p)
  if (p.departure_time && p.return_time) {
    s += ` · departs ${p.departure_time} · returns ${p.return_time}`
  }
  if (p.exclude_first_day_travel) {
    s += ' · day 1 / night 1 travel not counted in days/nights above'
  }
  return s
}
