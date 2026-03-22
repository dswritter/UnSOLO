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
  const d = new Date()
  d.setFullYear(d.getFullYear() + 2)
  return d.toISOString().split('T')[0]
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
