/**
 * Payload for `/host/trip-preview`, written from HostTripForm before opening the preview.
 * Use localStorage for the handoff: `sessionStorage` is per-tab, so `window.open(..., '_blank')`
 * cannot see data set in the parent tab.
 */
export const TRIP_PREVIEW_HANDOFF_KEY = 'unsolo_host_trip_preview_handoff'

/** @deprecated Prefer TRIP_PREVIEW_HANDOFF_KEY + localStorage; kept for one-time read fallback. */
export const TRIP_PREVIEW_SESSION_KEY = 'trip-preview'

export type HostTripPreviewPayload = {
  title: string
  shortDescription: string
  description: string
  priceRows: { rupees: string; facilities: string }[]
  tripDays: string
  tripNights: string
  maxGroupSize: string
  difficulty: string
  scheduleRows: { dep: string; ret: string }[]
  excludeFirstTravel: boolean
  departureTime: string
  returnTime: string
  selectedIncludes: string[]
  images: string[]
  interestTags: string[]
  destination: { id: string; name: string; state: string } | null
  paymentTiming?: string
  genderPreference?: string
  minAge?: string
  maxAge?: string
  minTripsCompleted?: string
  /** When editing, link to the saved public URL (may differ from this preview until saved). */
  livePackageSlug?: string | null
}
