import { INDIAN_STATES } from '@/lib/indian-states'

const STATE_SET = new Set(INDIAN_STATES.map(s => s.toLowerCase()))

function tidyCase(value: string): string {
  if (value !== value.toUpperCase()) return value
  return value.toLowerCase().replace(/\b\p{L}/gu, ch => ch.toUpperCase())
}

/** "SK Apts, Lane 8, Clement Town, DEHRADUN - 248002" → "Dehradun"; "…, JORHAT, ASSAM" → "Jorhat, Assam". */
export function shortListingLocation(
  location: string | null | undefined,
  destination?: { name?: string | null; state?: string | null } | null,
): string {
  if (destination?.name) return destination.state ? `${destination.name}, ${destination.state}` : destination.name
  const parts = (location ?? '')
    .split(',')
    .map(part => part.replace(/[-–]?\s*\d{6}\b/g, '').replace(/\bindia\b/i, '').trim())
    .filter(part => part && !/^\d+$/.test(part))
  if (parts.length === 0) return ''
  const last = parts[parts.length - 1]
  if (STATE_SET.has(last.toLowerCase()) && parts.length > 1) {
    return `${tidyCase(parts[parts.length - 2])}, ${tidyCase(last)}`
  }
  return tidyCase(last)
}

export function compactTripDuration(p: { trip_days?: number | null; trip_nights?: number | null; duration_days: number }): string {
  const days = p.trip_days ?? p.duration_days
  const nights = p.trip_nights ?? Math.max(0, p.duration_days - 1)
  return `${days}D/${nights}N`
}

export function unitShortLabel(unit: string | null | undefined): string {
  if (!unit) return ''
  return unit.replace(/^per_/, '').replace(/_/g, ' ')
}

export type TripCardBadge = { label: string; tone: 'past' | 'urgent' | 'featured' | 'community' }

/** Cards show at most one badge; highest-signal wins. */
export function primaryTripBadge(input: {
  pastEdition: boolean
  spotsLeft: number | null
  isFeatured: boolean
  isCommunity: boolean
}): TripCardBadge | null {
  if (input.pastEdition) return { label: 'Past trip', tone: 'past' }
  if (input.spotsLeft != null && input.spotsLeft > 0 && input.spotsLeft <= 5) {
    return { label: `Only ${input.spotsLeft} left`, tone: 'urgent' }
  }
  if (input.isFeatured) return { label: 'Featured', tone: 'featured' }
  if (input.isCommunity) return { label: 'Community', tone: 'community' }
  return null
}
