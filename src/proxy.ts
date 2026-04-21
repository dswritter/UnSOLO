import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/callback', '/api', '/terms', '/privacy', '/refund-policy', '/forgot-password', '/reset-password']
const PUBLIC_CONTENT = ['/explore', '/packages', '/leaderboard', '/contact']

export async function proxy(request: NextRequest) {
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

    const { pathname } = request.nextUrl

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
