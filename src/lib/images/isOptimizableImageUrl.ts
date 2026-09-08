/**
 * Mirrors `images.remotePatterns` in next.config.ts. The wander hero background
 * is admin-configurable to any HTTPS URL, so next/image can't blanket-trust it
 * (it throws for hosts outside remotePatterns) — this decides whether a given
 * URL is on a host we've allowlisted there, so callers can pass
 * `unoptimized={!isOptimizableImageUrl(url)}` and safely fall back to
 * unoptimized (still renders, just skips resize/reformat) for anything else.
 */
const OPTIMIZABLE_HOST_SUFFIXES = ['.supabase.co']
const OPTIMIZABLE_HOSTS_EXACT = new Set([
  'lh3.googleusercontent.com',
  'avatars.githubusercontent.com',
  'api.dicebear.com',
  'images.unsplash.com',
])

export function isOptimizableImageUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:') return false
    if (OPTIMIZABLE_HOSTS_EXACT.has(hostname)) return true
    return OPTIMIZABLE_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  } catch {
    return false
  }
}
