export type ListingPin = { lat: number; lon: number; label: string }

export function readListingPin(value: unknown): ListingPin | null {
  if (!value || typeof value !== 'object') return null
  const pin = value as Record<string, unknown>
  if (typeof pin.lat !== 'number' || !Number.isFinite(pin.lat) || Math.abs(pin.lat) > 90
    || typeof pin.lon !== 'number' || !Number.isFinite(pin.lon) || Math.abs(pin.lon) > 180
    || typeof pin.label !== 'string') return null
  return { lat: pin.lat, lon: pin.lon, label: pin.label }
}
