/**
 * Resolve a Google Maps share link (short or long) into lat/lon coordinates.
 *
 * Key insight: maps.app.goo.gl short URLs serve a Firebase Dynamic Links
 * JavaScript shim when hit with a desktop User-Agent — no coords anywhere
 * in the HTML. With a **mobile** UA, Google properly 302-redirects to the
 * canonical `google.com/maps/place/...@lat,lon,.../data=...!3d{lat}!4d{lon}`
 * URL, where we can extract precise POI coordinates.
 *
 * We prefer `!3d{lat}!4d{lon}` (precise pin location) over `@{lat},{lon}`
 * (approximate map viewport center).
 */

const ALLOWED_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'google.com', 'maps.google.com']
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function extractCoords(text: string): { lat: number; lon: number } | null {
  // !3d{lat}!4d{lon} — precise POI pin (most accurate)
  const data = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (data) return { lat: parseFloat(data[1]), lon: parseFloat(data[2]) }

  // @{lat},{lon},{zoom} — map viewport center
  const at = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) return { lat: parseFloat(at[1]), lon: parseFloat(at[2]) }

  // ?q=lat,lon or ?query=lat,lon
  const q = text.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),?\s*(-?\d+\.\d+)/)
  if (q) return { lat: parseFloat(q[1]), lon: parseFloat(q[2]) }

  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return Response.json({ error: 'Missing url param' }, { status: 400 })
  }

  // Validate hostname to prevent SSRF
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (!ALLOWED_HOSTS.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return Response.json({ error: 'Only Google Maps URLs are allowed' }, { status: 400 })
  }

  try {
    // Mobile UA is critical — it forces a real redirect for short URLs
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    const finalUrl = res.url

    // Try coords in the final URL first (most common case)
    let coords = extractCoords(finalUrl)

    // If not in the URL, scan the HTML body (handles edge cases where
    // Google serves an interstitial page with the target URL embedded)
    if (!coords) {
      const html = await res.text()
      coords = extractCoords(html)
    }

    if (!coords) {
      return Response.json(
        { url: finalUrl, error: 'Could not extract coordinates from this link' },
        { status: 200 },
      )
    }

    return Response.json({ url: finalUrl, lat: coords.lat, lon: coords.lon })
  } catch {
    return Response.json({ error: 'Could not resolve URL' }, { status: 502 })
  }
}
