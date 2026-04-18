/** Browser drafts for /host/create — multiple drafts per device, 30-day retention. */

/** @deprecated migrated into v2 store */
export const HOST_TRIP_CREATE_DRAFT_KEY = 'unsolo_host_trip_create_draft_v1'

export const HOST_TRIP_DRAFTS_STORE_KEY = 'unsolo_host_trip_drafts_v2'

/** Drafts older than this are removed on read/save. */
export const HOST_TRIP_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

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

export type HostTripDraftPayload = Omit<HostTripCreateDraftV1, 'v' | 'updatedAt'>

export type HostTripStoredDraft = {
  id: string
  updatedAt: number
  payload: HostTripDraftPayload
}

type DraftStoreV2 = {
  v: 2
  drafts: HostTripStoredDraft[]
}

const DEFAULT_SCHEDULE = [{ dep: '', ret: '' }]
const DEFAULT_PRICE = [{ rupees: '', facilities: '' }]

export function emptyHostTripCreateDraftFields(): HostTripDraftPayload {
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
    HostTripDraftPayload,
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

function readStoreV2Raw(): DraftStoreV2 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(HOST_TRIP_DRAFTS_STORE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as DraftStoreV2
    if (p.v !== 2 || !Array.isArray(p.drafts)) return null
    return p
  } catch {
    return null
  }
}

function writeStoreV2(drafts: HostTripStoredDraft[]): void {
  if (typeof window === 'undefined') return
  try {
    const t = Date.now()
    const filtered = drafts.filter((d) => t - d.updatedAt <= HOST_TRIP_DRAFT_MAX_AGE_MS)
    localStorage.setItem(HOST_TRIP_DRAFTS_STORE_KEY, JSON.stringify({ v: 2, drafts: filtered }))
  } catch {
    /* quota */
  }
}

/** One-time: move legacy single-key draft into v2 list. */
export function migrateLegacyHostTripDraftIfNeeded(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(HOST_TRIP_DRAFTS_STORE_KEY)) return
  try {
    const oldRaw = localStorage.getItem(HOST_TRIP_CREATE_DRAFT_KEY)
    if (!oldRaw) return
    const p = JSON.parse(oldRaw) as Partial<HostTripCreateDraftV1>
    if (p.v !== 1) {
      localStorage.removeItem(HOST_TRIP_CREATE_DRAFT_KEY)
      return
    }
    const { v: _v, updatedAt: _u, ...rest } = p as HostTripCreateDraftV1
    const payload = rest as HostTripDraftPayload
    if (!isHostTripCreateDraftNonEmpty(payload)) {
      localStorage.removeItem(HOST_TRIP_CREATE_DRAFT_KEY)
      return
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `draft-${Date.now()}`
    const draft: HostTripStoredDraft = {
      id,
      updatedAt: p.updatedAt || Date.now(),
      payload,
    }
    writeStoreV2([draft])
    localStorage.removeItem(HOST_TRIP_CREATE_DRAFT_KEY)
  } catch {
    try {
      localStorage.removeItem(HOST_TRIP_CREATE_DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }
}

export function listHostTripDrafts(): HostTripStoredDraft[] {
  if (typeof window === 'undefined') return []
  migrateLegacyHostTripDraftIfNeeded()
  const store = readStoreV2Raw()
  if (!store) return []
  const t = Date.now()
  let fresh = store.drafts.filter((d) => t - d.updatedAt <= HOST_TRIP_DRAFT_MAX_AGE_MS)
  if (fresh.length !== store.drafts.length) {
    writeStoreV2(fresh)
    fresh = readStoreV2Raw()?.drafts ?? fresh
  }
  return [...fresh].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getHostTripDraftById(id: string): HostTripStoredDraft | null {
  const drafts = listHostTripDrafts()
  return drafts.find((d) => d.id === id) ?? null
}

export function upsertHostTripDraft(id: string, payload: HostTripDraftPayload): void {
  if (typeof window === 'undefined') return
  migrateLegacyHostTripDraftIfNeeded()
  const t = Date.now()
  const store = readStoreV2Raw()
  const existing = (store?.drafts ?? []).filter((d) => t - d.updatedAt <= HOST_TRIP_DRAFT_MAX_AGE_MS)
  const drafts = existing.filter((d) => d.id !== id)
  drafts.push({ id, updatedAt: t, payload })
  writeStoreV2(drafts)
}

export function deleteHostTripDraft(id: string): void {
  if (typeof window === 'undefined') return
  migrateLegacyHostTripDraftIfNeeded()
  const store = readStoreV2Raw()
  if (!store) return
  const t = Date.now()
  const drafts = store.drafts.filter((d) => d.id !== id && t - d.updatedAt <= HOST_TRIP_DRAFT_MAX_AGE_MS)
  writeStoreV2(drafts)
}

