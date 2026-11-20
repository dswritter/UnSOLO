/** Opaque keyset cursors (base64url JSON). Validated on decode — never trusted blindly. */
export function encodeCursor(v: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url')
}

export function decodeCursor(c: string | undefined | null): { score?: number; id?: string; at?: string; offset?: number } | null {
  if (!c) return null
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as Record<string, unknown>
    const out: { score?: number; id?: string; at?: string; offset?: number } = {}
    if (typeof v.score === 'number' && Number.isFinite(v.score)) out.score = v.score
    if (typeof v.id === 'string' && /^[0-9a-f-]{36}$/i.test(v.id)) out.id = v.id
    if (typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at))) out.at = v.at
    if (typeof v.offset === 'number' && v.offset >= 0 && v.offset < 10000) out.offset = Math.floor(v.offset)
    return out
  } catch {
    return null
  }
}
