/**
 * How a trip or plan talks about its spots. "8/12 spots left" on a trip nobody has booked reads as
 * "nobody wants this", so the total only shows once it helps:
 *  - nobody booked yet  → "12 spots open" (just what's available)
 *  - under half booked  → "3 going" (just the bookings; the total only on the trip page)
 *  - half or more       → "4/12 spots left" (now the scarcity is real)
 *  - none left          → "Full"
 */
export type SeatStage = 'open' | 'going' | 'filling' | 'full'

export function seatStage(total: number, left: number): SeatStage {
  const n = Math.max(0, Math.round(total))
  const l = Math.min(Math.max(0, Math.round(left)), n)
  const booked = n - l
  if (n > 0 && l <= 0) return 'full'
  if (booked <= 0) return 'open'
  if (booked * 2 < n) return 'going'
  return 'filling'
}

const spots = (k: number) => (k === 1 ? 'spot' : 'spots')

/** Cards, rows, map pins, stories: never shows the total until half the spots are gone. */
export function seatShort(total: number, left: number): string {
  const n = Math.max(0, total), l = Math.min(Math.max(0, left), n)
  switch (seatStage(n, l)) {
    case 'full': return 'Full'
    case 'open': return `${n} ${spots(n)} open`
    case 'going': return `${n - l} going`
    default: return `${l}/${n} ${spots(l)} left`
  }
}

/** The trip page itself: same rule, plus the group size while it's under half booked. */
export function seatLong(total: number, left: number): string {
  const n = Math.max(0, total), l = Math.min(Math.max(0, left), n)
  switch (seatStage(n, l)) {
    case 'full': return 'Full'
    case 'open': return `${n} ${spots(n)} open`
    case 'going': return `${n - l} going · group of ${n}`
    default: return `${l} of ${n} ${spots(l)} left`
  }
}

/** Ring centre: big number, tiny "/12" only once half booked, and a word under it. */
export function seatCenter(total: number, left: number): { big: string; of?: string; small: string } {
  const n = Math.max(0, total), l = Math.min(Math.max(0, left), n)
  switch (seatStage(n, l)) {
    case 'full': return { big: String(n), of: `/${n}`, small: 'full' }
    case 'open': return { big: String(n), small: `${spots(n)} open` }
    case 'going': return { big: String(n - l), small: 'going' }
    default: return { big: String(l), of: `/${n}`, small: `${spots(l)} left` }
  }
}

/** Only worth an urgency badge or alert once half the spots are gone. */
export function seatsScarce(total: number | null | undefined, left: number | null | undefined): boolean {
  if (!total || left == null) return false
  return seatStage(total, left) === 'filling'
}
