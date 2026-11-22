/** Trip calendar helpers (dates are IST calendar days, YYYY-MM-DD). */

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Last day of a trip that starts on [start] and runs [durationDays] days (at least one). */
export function tripEndDate(start: string, durationDays: number | null | undefined): string {
  return addDays(start, Math.max(1, Math.round(durationDays ?? 1)) - 1)
}

/** True from the start day through the day after the trip ends (people travel home). */
export function isTripDay(start: string | null | undefined, durationDays: number | null | undefined, today: string): boolean {
  if (!start) return false
  return today >= start && today <= addDays(tripEndDate(start, durationDays), 1)
}
