/** Session payload for `/host/trip-preview` (set from HostTripForm before opening the tab). */

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
