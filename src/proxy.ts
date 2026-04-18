import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/callback', '/api', '/terms', '/privacy', '/refund-policy', '/forgot-password', '/reset-password']
const PUBLIC_CONTENT = ['/explore', '/packages', '/leaderboard', '/contact']

export function proxy(request: NextRequest) {
  // Fail-safe: if anything goes wrong, let the request through
  try {
    const { pathname } = request.nextUrl

    // Allow public routes, static assets, API routes
    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r)) ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/sounds') ||
      pathname.includes('.')

    const isPublicContent = PUBLIC_CONTENT.some(r => pathname.startsWith(r))

    if (isPublic || isPublicContent) {
      return NextResponse.next()
    }

    // Lightweight auth check: only check for Supabase auth cookie presence
    // NO network calls, NO await, NO Supabase client — just cookie check
    const allCookies = request.cookies.getAll()
    const hasAuthCookie = allCookies.some(c =>
      c.name.startsWith('sb-') && c.name.includes('auth-token')
    )

    if (!hasAuthCookie) {
      // No auth cookie → redirect to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    // Auth cookie exists → let through (actual validation happens in pages/layouts)
    // Redirect logged-in users away from login/signup (allow /login?verified=1 so we can show "you're in" after email confirm)
    if (hasAuthCookie && (pathname === '/login' || pathname === '/signup')) {
      if (pathname === '/login' && request.nextUrl.searchParams.get('verified') === '1') {
        return NextResponse.next()
      }
      const url = request.nextUrl.clone()
      url.pathname = '/explore'
      return NextResponse.redirect(url)
    }

    return NextResponse.next()
  } catch {
    // Fail-safe: never block requests
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)',
  ],
}
