/**
 * Same-site path check for links that come from data (notifications, pushes): "/x" yes;
 * "//host", "/\\host", absolute URLs, or anything with whitespace / control characters no.
 * Mirrors public.is_internal_link() in migration 120.
 */
export function isInternalLink(link: string | null | undefined): link is string {
  return typeof link === 'string' && /^\/([^/\\\s\p{Cc}][^\\\s\p{Cc}]*)?$/u.test(link)
}

export function safeInternalLink(link: string | null | undefined, fallback = '/activity'): string {
  return isInternalLink(link) ? link : fallback
}
