/**
 * OSM Nominatim reverse geocode (client) — UnSOLO User-Agent per usage policy.
 */
const USER_AGENT = 'UnSOLO/1.0 (https://unsolo.in)'

type NominatimReverse = {
  display_name?: string
  address?: {
    city?: string
    town?: string
    village?: string
    suburb?: string
    state_district?: string
    state?: string
  }
}

export function searchLabelFromNominatimReverse(data: NominatimReverse): string {
  const a = data.address
  if (a) {
    const place = a.town || a.city || a.village || a.suburb || a.state_district
    if (place && a.state) return `${place}, ${a.state}`
    if (place) return place
  }
  if (data.display_name) {
    return data.display_name
      .split(',')
      .slice(0, 2)
      .map(s => s.trim())
      .join(', ')
  }
  return ''
}

export async function reverseGeocodeToSearchLabel(lat: number, lon: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&format=json&addressdetails=1`,
    { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } },
  )
  if (!res.ok) return ''
  const data = (await res.json()) as NominatimReverse
  return searchLabelFromNominatimReverse(data) || `${lat.toFixed(3)}, ${lon.toFixed(3)}`
}
