/**
 * Phone verification for an existing account, usable with any auth source (cookie or bearer).
 * Mirrors src/actions/verification.ts (sendPhoneOTP / verifyPhoneOTP) — keep both in sync.
 * NOT a server-action module: callers must pass an already-authenticated user.
 */
import { timingSafeEqual } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { generateOTP, sendSMS } from '@/lib/sms/client'
import { validateIndianPhone } from '@/lib/utils'
import { MAX_OTP_PER_HOUR, MAX_OTP_VERIFY_ATTEMPTS, MIN_OTP_SEND_INTERVAL_SECONDS, OTP_EXPIRY_MINUTES } from '@/lib/constants'
import { isPhonePlaceholderEmail } from '@/lib/auth/phone-login'

export type OtpResult = { ok: true; devCode?: string } | { ok: false; error: string; retryAfter?: number }

export async function startPhoneOtp(user: User, rawPhone: string): Promise<OtpResult> {
  const phone = validateIndianPhone(rawPhone)
  if (!phone) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number (starting with 6-9)' }
  const svc = createServiceRoleClient()

  const { data: taken } = await svc.from('profiles').select('id').eq('phone_number', phone)
    .eq('is_phone_verified', true).neq('id', user.id).maybeSingle()
  if (taken) return { ok: false, error: 'This phone number is already registered to another account.' }

  const now = Date.now()
  const { data: recent } = await svc.from('phone_otp_verifications').select('created_at')
    .eq('user_id', user.id).gte('created_at', new Date(now - 3600_000).toISOString())
    .order('created_at', { ascending: false })
  const rows = recent ?? []
  if (rows.length >= MAX_OTP_PER_HOUR) return { ok: false, error: 'Too many codes requested. Try again later.', retryAfter: 3600 }
  if (rows[0] && now - new Date(rows[0].created_at).getTime() < MIN_OTP_SEND_INTERVAL_SECONDS * 1000) {
    return { ok: false, error: 'Please wait a few seconds before requesting another code.', retryAfter: MIN_OTP_SEND_INTERVAL_SECONDS }
  }

  const otp = generateOTP()
  const { error } = await svc.from('phone_otp_verifications').insert({
    user_id: user.id, phone_number: phone, otp_code: otp,
    expires_at: new Date(now + OTP_EXPIRY_MINUTES * 60_000).toISOString(),
  })
  if (error) return { ok: false, error: 'Could not start verification. Try again.' }

  const sent = await sendSMS(phone, otp)
  if (!sent.success) return { ok: false, error: 'SMS sending failed. Please try again.' }
  // Only when no SMS provider is configured AND not production (local testing of the apps).
  const devCode = sent.devConsoleOnly && process.env.NODE_ENV !== 'production' ? otp : undefined
  return { ok: true, ...(devCode ? { devCode } : {}) }
}

export async function confirmPhoneOtp(user: User, rawPhone: string, code: string): Promise<OtpResult> {
  const phone = validateIndianPhone(rawPhone)
  if (!phone) return { ok: false, error: 'Enter a valid Indian mobile number' }
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Enter the 6-digit code' }
  const svc = createServiceRoleClient()
  const { data: rec } = await svc.from('phone_otp_verifications').select('id, otp_code, attempts')
    .eq('user_id', user.id).eq('phone_number', phone).eq('verified', false)
    .gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!rec) return { ok: false, error: 'Code expired or not found. Request a new one.' }
  if (rec.attempts >= MAX_OTP_VERIFY_ATTEMPTS) return { ok: false, error: 'Too many failed attempts. Request a new code.' }
  await svc.from('phone_otp_verifications').update({ attempts: rec.attempts + 1 }).eq('id', rec.id)

  const a = Buffer.from(String(rec.otp_code)), b = Buffer.from(code)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: `Incorrect code. ${MAX_OTP_VERIFY_ATTEMPTS - rec.attempts - 1} attempts remaining.` }
  }
  const { data: taken } = await svc.from('profiles').select('id').eq('phone_number', phone)
    .eq('is_phone_verified', true).neq('id', user.id).maybeSingle()
  if (taken) return { ok: false, error: 'This phone number is already registered to another account.' }

  await svc.from('phone_otp_verifications').update({ verified: true }).eq('id', rec.id)
  const { error } = await svc.from('profiles').update({
    is_phone_verified: true, phone_number: phone, phone_country_code: '+91', phone_verified_method: 'otp',
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)
  if (error) return { ok: false, error: 'Could not save your number. Try again.' }
  if (user.email_confirmed_at && !isPhonePlaceholderEmail(user.email)) {
    await svc.from('profiles').update({ is_host: true, is_email_verified: true, phone_public: true }).eq('id', user.id)
  }
  return { ok: true }
}
