/** True when Next.js aborted a server action to perform `redirect()`. */
export function isLikelyNextRedirectError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const d = (e as { digest?: unknown }).digest
  return typeof d === 'string' && d.startsWith('NEXT_REDIRECT')
}
