import { z } from 'zod'

/** Contact values only: an option id is never an ownership/linking credential. */
export type HostListingContactOption = {
  id: string
  label: string
  email: string | null
  phone: string | null
  source: 'registered' | 'previous-listing'
  verified: boolean
  subtitle?: string
}

export const HOST_SEARCH_QUERY_LIMIT = 100
export const HOST_SEARCH_RESULT_LIMIT = 20

export function hostSearchQuery(query: string): string {
  if (typeof query !== 'string' || query.length > HOST_SEARCH_QUERY_LIMIT || /[\x00-\x1f\x7f]/.test(query)) {
    throw new Error('Invalid host search query (maximum 100 characters)')
  }
  return query.trim()
}

const contactRowSchema = z.object({
  id: z.string().min(1), label: z.string().trim().min(1),
  email: z.string().nullable(), phone: z.string().nullable(),
  source: z.enum(['registered', 'previous-listing']), verified: z.boolean(),
  subtitle: z.string().nullable().optional(),
}).superRefine((row, ctx) => {
  if ((row.source === 'registered') !== row.verified || !row.id.startsWith(`${row.source}:`)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid contact provenance' })
  }
})

/** Fail closed on unknown RPC shapes; normalize usable contacts without asserting a DB type. */
export function parseHostListingContacts(data: unknown): HostListingContactOption[] {
  const parsed = z.array(contactRowSchema).max(HOST_SEARCH_RESULT_LIMIT * 2).safeParse(data)
  if (!parsed.success) throw new Error('Unable to search host contacts')
  return parsed.data.flatMap(row => {
    const email = hostSearchEmail(row.email)
    const phone = row.phone?.trim().startsWith('+') ? hostSearchPhone(row.phone) : null
    if (!email && !phone) return []
    return [{ ...row, email, phone, subtitle: row.subtitle ?? undefined }]
  })
}

export function hostSearchEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase()
  return email && z.email().safeParse(email).success ? email : null
}

/** Mirrors host_contact_phone, including its legacy Indian country-prefix handling. */
export function hostSearchPhone(value: string | null | undefined, countryCode = '+91'): string | null {
  if (!value || !/^[+\d\s().-]+$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  const phone = value.trim().startsWith('+') ? `+${digits}`
    : countryCode === '+91' && digits.length === 12 && digits.startsWith('91') ? `+${digits}`
      : countryCode + digits
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null
}

/** Prefer verified records for identical pairs or subsets, never merge different pairs. */
export function dedupeHostListingContacts(options: HostListingContactOption[]): HostListingContactOption[] {
  const sorted = [...options].sort((a, b) => Number(b.verified) - Number(a.verified))
  const result: HostListingContactOption[] = []
  for (const option of sorted) {
    if (!option.email && !option.phone) continue
    const duplicate = result.some(existing =>
      (existing.email === option.email && existing.phone === option.phone) ||
      (existing.source === 'registered' && existing.verified && option.source === 'previous-listing' &&
        (!option.email || existing.email === option.email) && (!option.phone || existing.phone === option.phone)),
    )
    if (!duplicate) result.push(option)
    if (result.length === HOST_SEARCH_RESULT_LIMIT) break
  }
  return result
}