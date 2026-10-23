import type { ListingPin } from '@/lib/listing-location'

const NOMINATIM_HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'UnSOLO/1.0 (https://unsolo.in)' }

function photonLabel(p: Record<string, string | undefined>): string {
  const parts: string[] = []
  if (p.name) parts.push(p.name)
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`)
  else if (p.street) parts.push(p.street)
  const city = p.city || p.district || p.locality || p.town || p.village
  if (city && city !== p.name) parts.push(city)
  if (p.state && p.state !== city) parts.push(p.state)
  if (p.country) parts.push(p.country)
  return parts.join(', ')
}

function validPins(rows: Array<{ lat: number; lon: number; label: string }>): ListingPin[] {
  return rows.filter(r => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon)
    && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)
}

async function photonSearch(q: string): Promise<ListingPin[]> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`)
    if (!res.ok) return []
    const data = await res.json() as {
      features?: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }>
    }
    return validPins((data.features || []).map(f => ({
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: photonLabel(f.properties),
    })))
  } catch { return [] }
}

async function nominatimSearch(q: string, indiaOnly: boolean): Promise<ListingPin[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5${indiaOnly ? '&countrycodes=in' : ''}`,
      { headers: NOMINATIM_HEADERS },
    )
    if (!res.ok) return []
    const rows = await res.json() as Array<{ lat: string; lon: string; display_name: string }>
    return validPins(rows.map(r => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name })))
  } catch { return [] }
}

/**
 * Photon gives better fuzzy matches; when a very specific address isn't mapped,
 * progressively drop leading tokens, then fall back to Nominatim.
 */
export async function searchAddress(address: string): Promise<ListingPin[]> {
  const q = address.trim()
  if (!q) return []
  let results = await photonSearch(q)
  const tokens = q.split(/[,\s]+/).filter(Boolean)
  for (let keep = tokens.length - 1; results.length === 0 && keep >= 2; keep--) {
    results = await photonSearch(tokens.slice(-keep).join(' '))
  }
  if (results.length === 0) results = await nominatimSearch(q, true)
  if (results.length === 0) results = await nominatimSearch(q, false)
  return results
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: NOMINATIM_HEADERS })
    if (!res.ok) return fallback
    const data: { display_name?: string } = await res.json()
    return data.display_name || fallback
  } catch {
    return fallback
  }
}
