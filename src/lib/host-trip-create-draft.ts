/** Browser draft for /host/create — survives refresh and closing the tab (same device). */

export const HOST_TRIP_CREATE_DRAFT_KEY = 'unsolo_host_trip_create_draft_v1'

export type HostTripCreateDraftV1 = {
  v: 1
  updatedAt: number
  step: number
  title: string
  destinationId: string
  /** So we can show the label if the row is not in the public destinations list yet */
  destination: { id: string; name: string; state: string } | null
  description: string
  shortDescription: string
  priceRows: { rupees: string; facilities: string }[]
  tripDays: string
  tripNights: string
  excludeFirstTravel: boolean
  departureTime: 'morning' | 'evening'
  returnTime: 'morning' | 'evening'
  maxGroupSize: string
  paymentTiming: 'after_host_approval' | 'pay_on_booking'
  difficulty: string
  scheduleRows: { dep: string; ret: string }[]
  selectedIncludes: string[]
  images: string[]
  minAge: string
  maxAge: string
  genderPreference: 'all' | 'men' | 'women'
  minTripsCompleted: string
  interestTags: string[]
}

const DEFAULT_SCHEDULE = [{ dep: '', ret: '' }]
const DEFAULT_PRICE = [{ rupees: '', facilities: '' }]

export function emptyHostTripCreateDraftFields(): Omit<HostTripCreateDraftV1, 'v' | 'updatedAt'> {
  return {
    step: 0,
    title: '',
    destinationId: '',
    destination: null,
    description: '',
    shortDescription: '',
    priceRows: DEFAULT_PRICE.map((r) => ({ ...r })),
    tripDays: '',
    tripNights: '',
    excludeFirstTravel: true,
    departureTime: 'morning',
    returnTime: 'morning',
    maxGroupSize: '12',
    paymentTiming: 'after_host_approval',
    difficulty: 'moderate',
    scheduleRows: DEFAULT_SCHEDULE.map((r) => ({ ...r })),
    selectedIncludes: [],
    images: [],
    minAge: '',
    maxAge: '',
    genderPreference: 'all',
    minTripsCompleted: '',
    interestTags: [],
  }
}

export function isHostTripCreateDraftNonEmpty(
  d: Pick<
    HostTripCreateDraftV1,
    | 'title'
    | 'destinationId'
    | 'description'
    | 'shortDescription'
    | 'tripDays'
    | 'tripNights'
    | 'maxGroupSize'
    | 'priceRows'
    | 'scheduleRows'
    | 'selectedIncludes'
    | 'images'
    | 'minAge'
    | 'maxAge'
    | 'minTripsCompleted'
    | 'interestTags'
    | 'step'
  >,
): boolean {
  if ((d.step ?? 0) > 0) return true
  if (d.title.trim()) return true
  if (d.destinationId) return true
  if (d.description.trim()) return true
  if (d.shortDescription.trim()) return true
  if (d.tripDays.trim() || d.tripNights.trim()) return true
  if (d.minAge.trim() || d.maxAge.trim() || d.minTripsCompleted.trim()) return true
  if (d.interestTags.length > 0) return true
  if (d.selectedIncludes.length > 0) return true
  if (d.images.length > 0) return true
  const hasPrice = d.priceRows.some((r) => r.rupees.trim() || r.facilities.trim())
  if (hasPrice) return true
  const hasSchedule = d.scheduleRows.some((r) => r.dep || r.ret)
  if (hasSchedule) return true
  if (d.maxGroupSize && d.maxGroupSize !== '12') return true
  return false
}

export function loadHostTripCreateDraft(): HostTripCreateDraftV1 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(HOST_TRIP_CREATE_DRAFT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<HostTripCreateDraftV1>
    if (p.v !== 1) return null
    return p as HostTripCreateDraftV1
  } catch {
    return null
  }
}

export function saveHostTripCreateDraft(body: Omit<HostTripCreateDraftV1, 'v' | 'updatedAt'>): void {
  if (typeof window === 'undefined') return
  const full: HostTripCreateDraftV1 = {
    v: 1,
    updatedAt: Date.now(),
    ...body,
  }
  try {
    localStorage.setItem(HOST_TRIP_CREATE_DRAFT_KEY, JSON.stringify(full))
  } catch {
    /* quota / private mode */
  }
}

export function clearHostTripCreateDraft(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(HOST_TRIP_CREATE_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
