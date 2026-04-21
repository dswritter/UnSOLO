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

    // Refresh the session and write updated cookies back to the browser.
    // This is what keeps the session alive across tabs in Chrome.
    // Do NOT add any logic between createServerClient and getUser().
    const { data: { user } } = await supabase.auth.getUser()

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

    if (!user) {
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
