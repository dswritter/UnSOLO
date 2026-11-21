import { Resend } from 'resend'
import { isPhonePlaceholderEmail } from '@/lib/auth/phone-login'

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
    resendSingleton = withoutPlaceholderRecipients(new Resend(key))
    cachedNormalizedKey = key
  }
  return resendSingleton
}

/**
 * Phone-only accounts carry a placeholder auth email (<digits>@phone.unsolo.in, see lib/auth/phone-login).
 * It must never be mailed: drop those recipients from every send, and skip a send left with none.
 */
function withoutPlaceholderRecipients(resend: Resend): Resend {
  const send = resend.emails.send.bind(resend.emails)
  const keep = (v: unknown) => (Array.isArray(v) ? v.filter((x) => !isPhonePlaceholderEmail(String(x))) : isPhonePlaceholderEmail(String(v ?? '')) ? [] : v)
  resend.emails.send = (async (payload: Parameters<typeof send>[0], options?: Parameters<typeof send>[1]) => {
    const p = payload as unknown as Record<string, unknown>
    const to = keep(p.to)
    if (Array.isArray(to) && to.length === 0) return { data: null, error: null }
    return send({ ...p, to, ...(p.cc ? { cc: keep(p.cc) } : {}), ...(p.bcc ? { bcc: keep(p.bcc) } : {}) } as unknown as Parameters<typeof send>[0], options)
  }) as typeof resend.emails.send
  return resend
}
