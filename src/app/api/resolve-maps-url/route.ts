/**
 * Server-side helper to resolve a short Google Maps URL (maps.app.goo.gl / goo.gl/maps)
 * into the canonical long URL that contains @lat,lon coordinates.
 *
 * Done server-side because browser fetch() cannot follow cross-origin redirects
 * to extract the final URL.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return Response.json({ error: 'Missing url param' }, { status: 400 })
  }

  // Only allow Google Maps domains to prevent SSRF abuse
  const allowed = ['maps.app.goo.gl', 'goo.gl', 'google.com', 'maps.google.com']
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (!allowed.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return Response.json({ error: 'URL not allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 UnSOLO/1.0' },
    })
    // res.url is the final URL after all redirects
    return Response.json({ url: res.url })
  } catch {
    return Response.json({ error: 'Could not resolve URL' }, { status: 502 })
  }
}
