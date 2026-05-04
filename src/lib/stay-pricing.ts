/**
 * Stay-pricing helpers shared between the booking form (client-side preview)
 * and the booking server action (authoritative total).
 *
 * Conventions:
 * - dates are ISO date strings (`YYYY-MM-DD`).
 * - we count NIGHTS, not calendar days. Check-in Mon, check-out Wed = 2 nights
 *   (Mon night + Tue night). Sat/Sun nights are charged at `weekendPaise`
 *   when provided; otherwise they fall back to `weekdayPaise`.
 */

export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(`${checkIn}T00:00:00`)
  const b = new Date(`${checkOut}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const ms = b.getTime() - a.getTime()
  if (ms <= 0) return 0
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

/**
 * Total room-nights cost. `quantity` is the number of rooms / units.
 * `weekendPaise` is optional — when null, every night is `weekdayPaise`.
 */
export function calcStayTotalPaise(
  checkIn: string,
  checkOut: string,
  weekdayPaise: number,
  weekendPaise: number | null,
  quantity: number,
): number {
  const nights = nightsBetween(checkIn, checkOut)
  if (nights === 0) return 0
  if (!weekendPaise || weekendPaise === weekdayPaise) {
    return weekdayPaise * nights * quantity
  }
  // Walk each night and pick the rate.
  let total = 0
  const cur = new Date(`${checkIn}T00:00:00`)
  for (let i = 0; i < nights; i++) {
    const dow = cur.getDay() // 0 = Sun, 6 = Sat
    const isWeekend = dow === 0 || dow === 6
    total += isWeekend ? weekendPaise : weekdayPaise
    cur.setDate(cur.getDate() + 1)
  }
  return total * quantity
}
