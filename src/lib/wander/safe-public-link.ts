/** Admin-configured URLs: https only as external, or absolute in-site paths starting with /. */
export function sanitizeAdminPublicHref(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  if (t.startsWith('/')) return t.includes('//') ? null : t
  try {
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    return null
  } catch {
    return null
  }
}
