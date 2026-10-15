import { z } from 'zod'
import { validatePhone, PHONE_COUNTRY_CODES, type SupportedCountryCode } from '@/lib/utils'

export type HostListingContactInput = {
  name?: string | null
  email?: string | null
  phone?: string | null
  countryCode?: string
}

export type HostListingAssignment = {
  host_name?: string | null
  email: string | null
  phone: string | null
  status: 'pending' | 'claimed' | 'conflict'
}

/** PostgREST can embed a UNIQUE reverse FK as an object rather than an array. */
export function hostListingAssignmentRows(value: HostListingAssignment | HostListingAssignment[] | null | undefined): HostListingAssignment[] {
  return Array.isArray(value) ? value : value ? [value] : []
}

/** Store email case-insensitively and phones in E.164, never in public listing metadata. */
export function normalizeHostListingContact(input: HostListingContactInput) {
  const email = input.email?.trim().toLowerCase() || null
  if (email && !z.email().safeParse(email).success) throw new Error('Enter a valid host email address')

  let phone: string | null = null
  if (input.phone?.trim()) {
    const countryCode = input.countryCode || '+91'
    const rule = PHONE_COUNTRY_CODES[countryCode as SupportedCountryCode]
    if (!rule || !/^[+\d\s().-]+$/.test(input.phone)) throw new Error('Enter a valid host phone number')
    let digits = input.phone.replace(/\D/g, '')
    if (digits.length === rule.digits + countryCode.length - 1 && digits.startsWith(countryCode.slice(1))) {
      digits = digits.slice(countryCode.length - 1)
    }
    const local = validatePhone(digits, countryCode)
    if (!local) throw new Error(`Enter a valid ${rule.name} mobile number`)
    phone = countryCode + local
  }
  if (!email && !phone) throw new Error('Enter the host’s email or phone number')
  const name = input.name?.replace(/\s+/g, ' ').trim().slice(0, 80) || null
  return { email, phone, name }
}