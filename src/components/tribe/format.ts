import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export function dateRange(starts: string | null, ends: string | null): string {
  if (!starts) return ''
  const a = parseISO(starts)
  if (!ends || ends === starts) return format(a, 'EEE d MMM')
  const b = parseISO(ends)
  const sameMonth = a.getMonth() === b.getMonth()
  return `${format(a, sameMonth ? 'd' : 'd MMM')}–${format(b, 'd MMM')}`
}

export function nights(starts: string | null, ends: string | null): number | null {
  if (!starts || !ends) return null
  return Math.max(differenceInCalendarDays(parseISO(ends), parseISO(starts)), 0)
}

export function ago(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { roundingMethod: 'floor' })
    .replace(/ seconds?/, 's').replace(/ minutes?/, 'm').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, 'mo').replace(/ years?/, 'y')
}

export function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'
}
