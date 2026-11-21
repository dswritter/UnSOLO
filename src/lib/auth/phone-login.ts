/**
 * Phone sign-in on our own SMS gateway (2factor.in / MSG91 via lib/sms/client), not a Supabase SMS
 * provider. Used by web, Android and iOS through /api/v1/auth/phone/{start,verify}.
 *
 * 1. start: rate-limit (fail closed: every SMS costs money), send a 4-digit code, return a signed
 *    challenge `base64url(payload).base64url(HMAC(key, payload + "." + code))`. Nothing is stored;
 *    the code can't be recovered from the challenge without the server key.
 * 2. verify: check expiry, attempts (5 per challenge) and the HMAC; spend the challenge once.
 *    The account is the profile with this verified number, or a new one. A Supabase session is
 *    minted with an admin magic-link token (generateLink → verifyOtp), so clients receive the same
 *    session JSON as Supabase's own /auth/v1/verify and keep their refresh logic.
 *
 * Phone-only accounts get a placeholder auth email `<10 digits>@phone.unsolo.in` (Supabase sessions
 * need an email or phone identity; the phone identity would need a Supabase SMS provider). It is never
 * mailed: isPhonePlaceholderEmail() lets the UI hide it.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { validateIndianPhone } from '@/lib/utils'
import { MAX_OTP_VERIFY_ATTEMPTS, OTP_EXPIRY_MINUTES, SMS_OTP_LENGTH } from '@/lib/constants'

export const PHONE_EMAIL_DOMAIN = 'phone.unsolo.in'
export const phonePlaceholderEmail = (phone10: string) => `${phone10}@${PHONE_EMAIL_DOMAIN}`
export const isPhonePlaceholderEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`)
/** The account email if it's a real one, else '' (checkout prefills, profile API). */
export const contactEmail = (email: string | null | undefined) => (email && !isPhonePlaceholderEmail(email) ? email : '')

export type PhoneLoginDeps = {
  /** Service-role client: rate limits, profiles, auth admin. */
  svc: SupabaseClient
  /** Anon client (no persisted session) used to exchange the magic-link token for a session. */
  anon: SupabaseClient
  sendSMS: (phone: string, otp: string) => Promise<{ success: boolean; error?: string; devConsoleOnly?: boolean }>
  generateOTP: () => string
  /** Secret for signing challenges. */
  secret: string
  now?: () => number
  production?: boolean
}

export type StartResult =
  | { ok: true; challenge: string; expiresIn: number; devCode?: string }
  | { ok: false; code: 'bad_request' | 'rate_limited' | 'server_error'; error: string; retryAfter?: number }
export type VerifyResult =
  | { ok: true; session: Session; isNew: boolean }
  | { ok: false; code: 'bad_request' | 'rate_limited' | 'unauthorized' | 'server_error'; error: string; retryAfter?: number }

/** Limits. Phone and IP caps protect the OTP pack from SMS pumping. */
export const PHONE_LOGIN_LIMITS = {
  resendSec: 30,
  perPhoneHour: 5,
  perIpHour: 20,
  perIpDay: 60,
  verifyAttempts: MAX_OTP_VERIFY_ATTEMPTS,
} as const

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const key = (secret: string) => createHmac('sha256', secret).update('unsolo-phone-login-v1').digest()
const mac = (secret: string, payload: string, code: string) => createHmac('sha256', key(secret)).update(`${payload}.${code}`).digest()

type Payload = { v: 1; id: string; p: string; e: number }

/** true = allowed. Fails CLOSED: if the limiter is down we don't send (each SMS is paid). */
async function hit(svc: SupabaseClient, k: string, windowSec: number, max: number): Promise<boolean> {
  const { data, error } = await svc.rpc('hit_rate_limit', { p_key: k, p_window_seconds: windowSec, p_max: max })
  if (error) throw new Error(`rate limiter unavailable: ${error.message}`)
  return data !== false
}

export async function startPhoneLogin(deps: PhoneLoginDeps, rawPhone: string, ip: string): Promise<StartResult> {
  const phone = validateIndianPhone(rawPhone)
  if (!phone) return { ok: false, code: 'bad_request', error: 'Enter a valid 10-digit Indian mobile number' }
  const now = deps.now?.() ?? Date.now()
  const L = PHONE_LOGIN_LIMITS
  try {
    if (!(await hit(deps.svc, `plogin-resend:${phone}`, L.resendSec, 1))) {
      return { ok: false, code: 'rate_limited', error: 'Please wait a few seconds before asking for another code.', retryAfter: L.resendSec }
    }
    if (!(await hit(deps.svc, `plogin-phone:${phone}`, 3600, L.perPhoneHour))) {
      return { ok: false, code: 'rate_limited', error: 'Too many codes for this number. Try again in an hour.', retryAfter: 3600 }
    }
    if (!(await hit(deps.svc, `plogin-ip:${ip}`, 3600, L.perIpHour)) || !(await hit(deps.svc, `plogin-ipday:${ip}`, 86_400, L.perIpDay))) {
      return { ok: false, code: 'rate_limited', error: 'Too many codes requested. Try again later.', retryAfter: 3600 }
    }
  } catch {
    return { ok: false, code: 'server_error', error: 'Phone sign-in is unavailable right now. Use email for now.' }
  }

  const otp = deps.generateOTP()
  const payload = b64u(JSON.stringify({ v: 1, id: randomUUID(), p: phone, e: now + OTP_EXPIRY_MINUTES * 60_000 } satisfies Payload))
  const sent = await deps.sendSMS(phone, otp)
  if (!sent.success) return { ok: false, code: 'server_error', error: 'We couldn’t send the SMS. Try again.' }
  const devCode = sent.devConsoleOnly && !deps.production ? otp : undefined
  return { ok: true, challenge: `${payload}.${b64u(mac(deps.secret, payload, otp))}`, expiresIn: OTP_EXPIRY_MINUTES * 60, ...(devCode ? { devCode } : {}) }
}

function readChallenge(secret: string, challenge: string, code: string): { payload: Payload; valid: boolean } | null {
  const [p, sig] = challenge.split('.')
  if (!p || !sig) return null
  let payload: Payload
  try { payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) } catch { return null }
  if (payload?.v !== 1 || typeof payload.id !== 'string' || typeof payload.p !== 'string' || typeof payload.e !== 'number') return null
  const expected = mac(secret, p, code)
  const got = Buffer.from(sig, 'base64url')
  return { payload, valid: got.length === expected.length && timingSafeEqual(got, expected) }
}

export async function verifyPhoneLogin(deps: PhoneLoginDeps, challenge: string, code: string, ip: string): Promise<VerifyResult> {
  if (!new RegExp(`^\\d{${SMS_OTP_LENGTH}}$`).test(code)) return { ok: false, code: 'bad_request', error: `Enter the ${SMS_OTP_LENGTH}-digit code` }
  const read = readChallenge(deps.secret, challenge, code)
  if (!read) return { ok: false, code: 'bad_request', error: 'That code request isn’t valid. Ask for a new code.' }
  const { payload, valid } = read
  const now = deps.now?.() ?? Date.now()
  if (payload.e < now) return { ok: false, code: 'unauthorized', error: 'That code has expired. Ask for a new one.' }
  const L = PHONE_LOGIN_LIMITS
  try {
    if (!(await hit(deps.svc, `plogin-try:${payload.id}`, OTP_EXPIRY_MINUTES * 60, L.verifyAttempts))
      || !(await hit(deps.svc, `plogin-tryip:${ip}`, 3600, 60))) {
      return { ok: false, code: 'rate_limited', error: 'Too many attempts. Ask for a new code.', retryAfter: 60 }
    }
    if (!valid) return { ok: false, code: 'unauthorized', error: 'That code didn’t work. Check it and try again.' }
    // One sign-in per code.
    if (!(await hit(deps.svc, `plogin-used:${payload.id}`, OTP_EXPIRY_MINUTES * 60, 1))) {
      return { ok: false, code: 'unauthorized', error: 'That code was already used. Ask for a new one.' }
    }
  } catch {
    return { ok: false, code: 'server_error', error: 'Phone sign-in is unavailable right now. Use email for now.' }
  }
  return signInVerifiedPhone(deps, payload.p)
}

/** The phone is proven: find its account (or create one) and mint a session. */
async function signInVerifiedPhone(deps: PhoneLoginDeps, phone: string): Promise<VerifyResult> {
  const { svc, anon } = deps
  const fail = (error = 'Couldn’t sign you in. Try again.'): VerifyResult => ({ ok: false, code: 'server_error', error })

  const { data: owner } = await svc.from('profiles').select('id').eq('phone_number', phone).eq('is_phone_verified', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  let email: string
  let isNew = false
  if (owner?.id) {
    const { data, error } = await svc.auth.admin.getUserById(owner.id)
    if (error || !data?.user) return fail()
    if (data.user.email) {
      email = data.user.email
    } else {
      email = phonePlaceholderEmail(phone)
      const { error: upd } = await svc.auth.admin.updateUserById(owner.id, { email, email_confirm: true })
      if (upd) return fail()
    }
  } else {
    email = phonePlaceholderEmail(phone)
    const { data, error } = await svc.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { username: 'traveller', phone_signup: true },
    })
    // An earlier phone sign-up whose number was later unverified keeps its placeholder email: reuse it.
    if (error && !/already|exists|registered/i.test(error.message)) return fail()
    isNew = !!data?.user
  }

  const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return fail()
  if (!owner?.id) {
    // New (or returning placeholder) account: record the number it just proved.
    const userId = link.user?.id
    if (!userId) return fail()
    const { error: pErr } = await svc.from('profiles').update({
      phone_number: phone, phone_country_code: '+91', is_phone_verified: true, phone_verified_method: 'otp',
      updated_at: new Date().toISOString(),
    }).eq('id', userId)
    if (pErr) return fail()
  }
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (vErr || !verified?.session) return fail()
  return { ok: true, session: verified.session, isNew }
}
