import { NextResponse, type NextRequest } from 'next/server'

const UNSOLO_HOSTS = new Set(['unsolo.in', 'www.unsolo.in'])

/**
 * Normalize apex vs www to match NEXT_PUBLIC_APP_URL so session + branding stay
 * consistent. Pair with shared auth cookie domain (see auth-cookie-options).
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return NextResponse.next()
  }

  let canonicalHost: string
  try {
    canonicalHost = new URL(process.env.NEXT_PUBLIC_APP_URL || 'about:blank').hostname.toLowerCase()
  } catch {
    return NextResponse.next()
  }

  if (!UNSOLO_HOSTS.has(host) || !UNSOLO_HOSTS.has(canonicalHost)) {
    return NextResponse.next()
  }

  if (host === canonicalHost) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.hostname = canonicalHost
  return NextResponse.redirect(url, 308)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)',
  ],
}
