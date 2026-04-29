import type { CookieOptionsWithName } from '@supabase/ssr'

const UNSOLO_HOSTS = new Set(['unsolo.in', 'www.unsolo.in'])

/**
 * Supabase SSR defaults to host-only session cookies. The site is reachable as
 * both apex and www, which are different cookie "sites" — a session on one host
 * does not appear on the other (often noticed when opening a new tab).
 *
 * Setting Domain=.unsolo.in (HTTPS only) shares auth between them. See:
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#domain
 */
export function getSupabaseAuthCookieOptions(): {
  cookieOptions?: CookieOptionsWithName
} {
  if (process.env.NODE_ENV !== 'production') {
    return {}
  }

  let appHost: string
  try {
    appHost = new URL(process.env.NEXT_PUBLIC_APP_URL || '').hostname.toLowerCase()
  } catch {
    return {}
  }

  if (!UNSOLO_HOSTS.has(appHost)) {
    return {}
  }

  return {
    cookieOptions: {
      domain: '.unsolo.in',
      path: '/',
      sameSite: 'lax',
      secure: true,
      maxAge: 400 * 24 * 60 * 60,
    },
  },
}
