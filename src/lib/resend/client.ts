import { Resend } from 'resend'

let resendSingleton: Resend | null = null
let cachedNormalizedKey: string | null = null

/**
 * Normalize env value (Vercel / copy-paste often adds wrapping quotes or BOM).
 * Resend API keys are `re_…` strings.
 */
function normalizeResendApiKey(raw: string | undefined): string {
  if (!raw) return ''
  let s = raw.trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim()
  return s
}

/** Use at send time so RESEND_API_KEY is read when the request runs (avoids undefined at module load). */
export function getResend(): Resend {
  const key = normalizeResendApiKey(process.env.RESEND_API_KEY)
  if (!key) {
    throw new Error('RESEND_API_KEY is not set')
  }
  if (!resendSingleton || cachedNormalizedKey !== key) {
    resendSingleton = new Resend(key)
    cachedNormalizedKey = key
  }
  return resendSingleton
}
