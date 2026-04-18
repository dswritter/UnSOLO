import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function generateConfirmationCode(): string {
  const year = new Date().getFullYear()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return `UNS-${year}-${code}`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function validateIndianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-\+]/g, '')
  const phone = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits
  if (phone.length !== 10) return null
  if (!/^[6-9]\d{9}$/.test(phone)) return null
  return phone
}

export function formatDateRange(departureDateStr: string, durationDays: number): string {
  const dep = new Date(departureDateStr + 'T00:00:00')
  const ret = new Date(dep)
  ret.setDate(ret.getDate() + durationDays - 1)

  const depStr = dep.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const retStr = ret.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return `${depStr} → ${retStr}`
}

export function getMaxDate(): string {
  const { MAX_BOOKING_FUTURE_YEARS } = require('@/lib/constants')
  const d = new Date()
  d.setFullYear(d.getFullYear() + MAX_BOOKING_FUTURE_YEARS)
  return d.toISOString().split('T')[0]
}

/** @param tripEndDateStr Last day on trip (YYYY-MM-DD) from package return_dates when available. */
export function getTripCountdown(
  travelDate: string,
  durationDays: number = 1,
  tripEndDateStr?: string | null,
): { text: string; emoji: string } | null {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const departure = new Date(travelDate + 'T12:00:00')
  departure.setHours(0, 0, 0, 0)
  const lastTripDay = tripEndDateStr
    ? new Date(tripEndDateStr + 'T12:00:00')
    : (() => {
        const r = new Date(departure)
        r.setDate(r.getDate() + Math.max(0, durationDays - 1))
        return r
      })()
  lastTripDay.setHours(0, 0, 0, 0)

  const msPerDay = 86400000
  const daysUntilDep = Math.ceil((departure.getTime() - now.getTime()) / msPerDay)
  const dayAfterTrip = new Date(lastTripDay)
  dayAfterTrip.setDate(dayAfterTrip.getDate() + 1)
  const daysUntilReturn = Math.ceil((dayAfterTrip.getTime() - now.getTime()) / msPerDay)

  if (daysUntilReturn <= 0) return null // trip is over

  if (daysUntilDep <= 0 && daysUntilReturn > 0) {
    return { text: "You're on the trip right now!", emoji: "🏔️" }
  }

  if (daysUntilDep === 0) return { text: 'TODAY! Have an amazing trip!', emoji: '🚀' }
  if (daysUntilDep <= 7) return { text: `${daysUntilDep} day${daysUntilDep > 1 ? 's' : ''}! Almost there!`, emoji: '🎉' }
  if (daysUntilDep <= 30) return { text: `${daysUntilDep} days to go! Start packing!`, emoji: '🎒' }
  return { text: `${daysUntilDep} days to go`, emoji: '📅' }
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}
