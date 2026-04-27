import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/callback', '/api', '/terms', '/privacy', '/refund-policy', '/forgot-password', '/reset-password']
const PUBLIC_CONTENT = ['/explore', '/wander', '/packages', '/leaderboard', '/contact']

/** Wander is only served on production host (and localhost for dev). Preview/staging → home. */
function isWanderAllowedHost(hostHeader: string | null): boolean {
  const host = hostHeader?.split(':')[0]?.toLowerCase() ?? ''
  if (host === 'unsolo.in' || host === 'www.unsolo.in') return true
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (process.env.WANDER_ALLOW_NON_PRODUCTION === '1') return true
  return false
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/wander' || pathname.startsWith('/wander/')) {
    if (!isWanderAllowedHost(request.headers.get('host'))) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url, 307)
    }
  }

  // Build the base response first so the Supabase client can attach updated
  // session cookies to it. Must use this response object (not NextResponse.next())
  // for every return path so refreshed cookies always reach the browser.
  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      },
    )

    // Use getSession() here — reads the JWT from cookies locally with no
    // network round-trip. getUser() (which calls the Supabase auth server on
    // every request) can intermittently return null in Chrome when the token
    // is valid but the upstream call is slow or fails, causing spurious logouts.
    // Token validity and expiry are still enforced; refresh happens via the
    // Supabase client when the access token is near expiry.
    const { data: { session } } = await supabase.auth.getSession()

    // Retired preview URLs → canonical auth (query string preserved on cloned URL)
    if (pathname === '/login-v2' || pathname.startsWith('/login-v2/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url, 308)
    }
    if (pathname === '/signup-v2' || pathname.startsWith('/signup-v2/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/signup'
      return NextResponse.redirect(url, 308)
    }

    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r)) ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/sounds') ||
      pathname.includes('.')

    const isPublicContent = PUBLIC_CONTENT.some(r => pathname.startsWith(r))

    if (isPublic || isPublicContent) {
      return supabaseResponse
    }

    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    // Fail-safe: never block a request if anything goes wrong.
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)',
  ],
}
