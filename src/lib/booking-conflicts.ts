/**
 * Pure evaluation of multi-booking conflicts: a user MAY book a trip more than once
 * (e.g. once for themselves, again for friends), so instead of a blanket block we
 * decide allow / warn / prevent. Side-effect-free + unit-tested.
 *
 * Matching is by NORMALISED name (no stable traveller ids exist); "self" = a
 * traveller whose name matches the booker's profile name.
 */

export type ExistingBookingForConflict = {
  packageId: string
  travelDate: string | null
  travellerNames: string[]
  /** Departure / trip-end in ms (for cross-trip date-overlap). */
  startMs: number
  endMs: number
}

export type NewBookingAttempt = {
  packageId: string
  travelDate: string | null
  travellerNames: string[]
  selfName: string | null
  startMs: number
  endMs: number
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export function evaluateBookingConflicts(
  attempt: NewBookingAttempt,
  existing: ExistingBookingForConflict[],
): { prevent?: string; warnings: string[] } {
  const warnings: string[] = []
  const selfName = norm(attempt.selfName)
  const attemptNames = attempt.travellerNames.map(norm).filter(Boolean)
  const attemptSet = new Set(attemptNames)

  const sameTrip = existing.filter((e) => e.packageId === attempt.packageId)
  const sameTripNames = new Set<string>()
  for (const e of sameTrip) for (const n of e.travellerNames.map(norm)) if (n) sameTripNames.add(n)

  // PREVENT — self already on this trip and included again.
  if (selfName && attemptSet.has(selfName) && sameTripNames.has(selfName)) {
    return { prevent: 'You have already booked this trip for yourself.', warnings: [] }
  }

  // PREVENT — exact duplicate (same departure date + identical traveller set).
  for (const e of sameTrip) {
    if (e.travelDate && attempt.travelDate && e.travelDate === attempt.travelDate && attemptSet.size > 0) {
      const eSet = new Set(e.travellerNames.map(norm).filter(Boolean))
      if (eSet.size === attemptSet.size && [...attemptSet].every((n) => eSet.has(n))) {
        return { prevent: 'You already have this exact booking (same trip, date and travellers).', warnings: [] }
      }
    }
  }

  // WARN — non-self travellers overlap an existing booking of this trip.
  const overlap = [...new Set(attemptNames.filter((n) => n !== selfName && sameTripNames.has(n)))]
  if (overlap.length) {
    warnings.push(`You already booked this trip for ${overlap.join(', ')} — continue only if these are different people.`)
  }

  // WARN — same trip + same departure date with all-new travellers (accidental re-book).
  if (
    attempt.travelDate &&
    overlap.length === 0 &&
    sameTrip.some((e) => e.travelDate === attempt.travelDate)
  ) {
    warnings.push('You already have a booking on this departure date for this trip.')
  }

  // WARN — date range overlaps any active booking (any trip).
  if (existing.some((e) => e.startMs < attempt.endMs && e.endMs > attempt.startMs)) {
    warnings.push('You already have a trip booked during these dates.')
  }

  return { warnings: [...new Set(warnings)] }
}
