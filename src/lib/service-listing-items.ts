import type { ServiceEventScheduleEntry, ServiceListingType } from '@/types'
import type { HostServiceItemDraft } from '@/actions/host-service-listings'

const TIME_RE = /^\d{2}:\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type ServiceUnit = NonNullable<HostServiceItemDraft['unit']>

export type ServiceListingItemsSummary = {
  items: HostServiceItemDraft[]
  price_paise: number
  unit: ServiceUnit
  amenities: string[] | null
  images: string[] | null
}

/**
 * Validates item drafts and derives the master listing fields from them, shared
 * by host submissions and staff listings created on a host's behalf.
 */
export function summarizeServiceListingItems(input: {
  type: ServiceListingType
  unit: ServiceUnit
  amenities: string[]
  items: HostServiceItemDraft[]
}): { error: string } | ServiceListingItemsSummary {
  const items = input.items.filter(i => i.name.trim().length > 0)
  if (items.length === 0) return { error: 'Please add at least one item to your listing' }
  if (items.length > 100) return { error: 'A listing can hold at most 100 items' }
  for (const item of items) {
    if (item.images.length > 5) return { error: `"${item.name}": max 5 photos per item` }
    if (item.price_paise < 0 || item.quantity_available < 0 || item.max_per_booking < 1) {
      return { error: `"${item.name}" has invalid price, quantity, or max` }
    }
  }

  // Cheapest item drives discovery sorting; first item with photos supplies the hero.
  const price_paise = Math.min(...items.map(i => i.price_paise))
  const heroImages = items.find(i => i.images.length > 0)?.images.slice(0, 5) ?? []

  // Rentals & stays: each item owns its unit + amenities. The master unit follows
  // the cheapest item so "from ₹X / unit" discovery cards stay coherent.
  let unit = input.unit
  let amenities = input.amenities
  if (input.type === 'rentals' || input.type === 'stays') {
    for (const item of items) {
      if (!item.unit) return { error: `"${item.name}": please pick a pricing unit` }
    }
    const cheapest = items.reduce((a, b) => (a.price_paise <= b.price_paise ? a : b))
    unit = cheapest.unit ?? unit
    amenities = []
  }

  return {
    items,
    price_paise,
    unit,
    amenities: amenities.length > 0 ? amenities : null,
    images: heroImages.length > 0 ? heroImages : null,
  }
}

export function serviceListingItemRows(listingId: string, type: ServiceListingType, items: HostServiceItemDraft[]) {
  const perItem = type === 'rentals' || type === 'stays'
  return items.map((item, idx) => {
    const row: Record<string, unknown> = {
      service_listing_id: listingId,
      name: item.name.trim(),
      description: item.description?.trim() || null,
      price_paise: item.price_paise,
      quantity_available: item.quantity_available,
      max_per_booking: item.max_per_booking,
      images: item.images,
      position_order: idx,
      unit: perItem ? (item.unit ?? null) : null,
      amenities: perItem ? (item.amenities ?? []) : null,
    }
    // Omit the column unless used, so inserts work before migration 076.
    if (type === 'stays' && item.weekend_price_paise != null) row.weekend_price_paise = item.weekend_price_paise
    return row
  })
}

/**
 * Validate + normalise an `event_schedule` payload. Returns null for empty,
 * which the column treats as "ongoing / non-date-specific". Drops malformed
 * entries silently rather than throwing, so a single bad row from the UI
 * doesn't block a save.
 */
export function sanitizeEventSchedule(raw: unknown): ServiceEventScheduleEntry[] | null {
  if (!Array.isArray(raw)) return null
  const seenDates = new Set<string>()
  const entries: ServiceEventScheduleEntry[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const date = (item as { date?: unknown }).date
    if (typeof date !== 'string' || !DATE_RE.test(date)) continue
    if (seenDates.has(date)) continue
    seenDates.add(date)

    const rawSlots = (item as { slots?: unknown }).slots
    if (rawSlots == null) {
      entries.push({ date, slots: null })
      continue
    }
    if (!Array.isArray(rawSlots)) {
      entries.push({ date, slots: null })
      continue
    }
    const slots: { start: string; end: string }[] = []
    for (const s of rawSlots) {
      if (!s || typeof s !== 'object') continue
      const start = (s as { start?: unknown }).start
      const end = (s as { end?: unknown }).end
      if (typeof start !== 'string' || !TIME_RE.test(start)) continue
      if (typeof end !== 'string' || !TIME_RE.test(end)) continue
      if (start >= end) continue // end must be strictly after start
      slots.push({ start, end })
    }
    slots.sort((a, b) => a.start.localeCompare(b.start))
    entries.push({ date, slots: slots.length > 0 ? slots : null })
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))
  return entries.length > 0 ? entries : null
}
