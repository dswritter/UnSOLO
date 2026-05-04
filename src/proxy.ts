import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie-options'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/callback', '/api', '/terms', '/privacy', '/refund-policy', '/forgot-password', '/reset-password']
// Pages that render usefully without auth — let the page itself decide whether to gate
// (sign-in prompts, redirects, etc). Avoids spurious /login bounces when getSession()
// briefly reads stale cookies during navigation on mobile.
//
// All bottom-nav destinations are listed here so a transient session-read miss never
// kicks the user back to /login while they switch tabs. Pages still call their own
// `if (!user) redirect('/login')` (see e.g. tribe/page.tsx) when they truly need auth.
const PUBLIC_CONTENT = [
  '/packages',
  '/listings',
  '/leaderboard',
  '/contact',
  '/offers',
  '/profile',
  '/host',
  '/become-host',
  '/community',
  '/tribe',
  '/chat',
  '/bookings',
  '/notifications',
  '/referrals',
]

const UNSOLO_HOSTS = new Set(['unsolo.in', 'www.unsolo.in'])

function matchesRoute(pathname: string, route: string): boolean {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * Normalize apex vs www to match NEXT_PUBLIC_APP_URL so session + branding stay
 * consistent. Pair with shared auth cookie domain (see auth-cookie-options).
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  let canonicalHost: string
  try {
    canonicalHost = new URL(process.env.NEXT_PUBLIC_APP_URL || 'about:blank').hostname.toLowerCase()
  } catch {
    return null
  }

  if (!UNSOLO_HOSTS.has(host) || !UNSOLO_HOSTS.has(canonicalHost)) {
    return null
  }

  if (host === canonicalHost) {
    return null
  }

  const url = request.nextUrl.clone()
  url.hostname = canonicalHost
  return NextResponse.redirect(url, 308)
}

/** Wander is only served on production host (and localhost for dev). Preview/staging → home. */
function isWanderAllowedHost(hostHeader: string | null): boolean {
  const host = hostHeader?.split(':')[0]?.toLowerCase() ?? ''
  if (host === 'unsolo.in' || host === 'www.unsolo.in') return true
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (process.env.WANDER_ALLOW_NON_PRODUCTION === '1') return true
  return false
}

function nextWithUnsoloPath(request: NextRequest, browserPathname: string): NextResponse {
  const h = new Headers(request.headers)
  h.set('x-unsolo-pathname', browserPathname)
  return NextResponse.next({ request: { headers: h } })
}

export async function proxy(request: NextRequest) {
  const canonical = canonicalHostRedirect(request)
  if (canonical) return canonical

  const { pathname } = request.nextUrl
  const browserPathname = pathname

  /** Legacy `/wander` and `/explore` merged into `/` (search mode via `?search=1`). */
  if (pathname === '/wander' || pathname.startsWith('/wander/')) {
    if (!isWanderAllowedHost(request.headers.get('host'))) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url, 307)
    }
    const url = request.nextUrl.clone()
    if (pathname === '/wander') {
      url.pathname = '/'
    } else {
      const rest = pathname.slice('/wander'.length) || '/'
      url.pathname = rest.startsWith('/') ? rest : `/${rest}`
    }
    return NextResponse.redirect(url, 308)
  }

  if (pathname === '/explore' || pathname.startsWith('/explore/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    if (!url.searchParams.has('search')) {
      url.searchParams.set('search', '1')
    }
    return NextResponse.redirect(url, 308)
  }

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

  const isPublic = PUBLIC_ROUTES.some(r => matchesRoute(pathname, r)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/sounds') ||
    pathname.includes('.')

  const isPublicContent = PUBLIC_CONTENT.some(r => matchesRoute(pathname, r))

  // Public routes: do NOT touch Supabase from middleware.
  //
  // Reason: every getSession() call here is a potential JWT refresh. When the
  // user lands on the home page on mobile we render N listing cards (each a
  // <Link>) plus the bottom nav — Next.js prefetches those Links concurrently,
  // and *each* prefetch fans into a middleware run. Multiple concurrent
  // refreshes race the single-use Supabase refresh token: the first wins, the
  // rest see session=null (or, worse, their refresh fails and the cookie pair
  // is left invalid for follow-up requests). Skipping the Supabase call on
  // public routes — which is most of the app — eliminates that race entirely.
  // The token still refreshes naturally on the next protected-route hit, on
  // any client-side supabase call, or when the page itself reads getRequestAuth().
  if (isPublic || isPublicContent) {
    return nextWithUnsoloPath(request, browserPathname)
  }

  // Protected route: now we read + refresh the session.
  let supabaseResponse = nextWithUnsoloPath(request, browserPathname)
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        ...getSupabaseAuthCookieOptions(),
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = nextWithUnsoloPath(request, browserPathname)
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      },
    )
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      // Even on protected routes a concurrent refresh-token race can leave
      // session=null while the auth cookie itself is still present. Fall
      // through to the page in that case — the page-level getRequestAuth()
      // will revalidate via getUser() and either confirm the session or
      // redirect itself. Only middleware-redirect when there's no auth
      // cookie at all (genuinely signed out).
      const hasAuthCookie = request.cookies
        .getAll()
        .some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
      if (hasAuthCookie) {
        return supabaseResponse
      }
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    // Fail-safe: never block a request if anything goes wrong.
    return nextWithUnsoloPath(request, browserPathname)
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)',
  ],
}
