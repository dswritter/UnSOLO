'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS, generateOTP } from '@/lib/sms/client'
import { validateIndianPhone } from '@/lib/utils'
import {
  MAX_OTP_PER_HOUR,
  MAX_OTP_VERIFY_ATTEMPTS,
  MIN_OTP_SEND_INTERVAL_SECONDS,
  OTP_EXPIRY_MINUTES,
} from '@/lib/constants'
import { revalidatePath } from 'next/cache'

function formatOtpRetryMessage(notBefore: Date): string {
  const sec = Math.ceil((notBefore.getTime() - Date.now()) / 1000)
  if (sec <= 0) return 'Try again in a moment.'
  if (sec < 60) return `Please wait ${sec} seconds before requesting another OTP.`
  const min = Math.ceil(sec / 60)
  return `Too many OTP requests. Try again in ${min} minute(s).`
}

/** Earliest time the user may send another OTP (server-side; survives refresh). */
async function getOtpSendNotBefore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Date | null> {
  const now = Date.now()
  const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString()

  const { data: hourlyRows } = await supabase
    .from('phone_otp_verifications')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', oneHourAgoIso)
    .order('created_at', { ascending: true })

  let notBeforeMs = 0

  if (hourlyRows && hourlyRows.length >= MAX_OTP_PER_HOUR) {
    const oldest = new Date(hourlyRows[0].created_at).getTime()
    notBeforeMs = Math.max(notBeforeMs, oldest + 60 * 60 * 1000)
  }

  const { data: lastRow } = await supabase
    .from('phone_otp_verifications')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastRow) {
    const last = new Date(lastRow.created_at).getTime()
    notBeforeMs = Math.max(notBeforeMs, last + MIN_OTP_SEND_INTERVAL_SECONDS * 1000)
  }

  if (notBeforeMs > now) return new Date(notBeforeMs)
  return null
}

export async function sendPhoneOTP(phoneNumber: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Validate phone format
  if (!validateIndianPhone(phoneNumber)) {
    return { error: 'Enter a valid 10-digit Indian mobile number (starting with 6-9)' }
  }

  const { data: phoneTaken } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone_number', phoneNumber)
    .eq('is_phone_verified', true)
    .neq('id', user.id)
    .maybeSingle()

  if (phoneTaken) {
    return { error: 'This phone number is already registered to another account.' }
  }

  const notBeforeSend = await getOtpSendNotBefore(supabase, user.id)
  if (notBeforeSend) {
    return {
      error: formatOtpRetryMessage(notBeforeSend),
      cooldownUntil: notBeforeSend.toISOString(),
    }
  }

  // Generate and store OTP
  const otp = generateOTP()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

  const { error: insertError } = await supabase.from('phone_otp_verifications').insert({
    user_id: user.id,
    phone_number: phoneNumber,
    otp_code: otp,
    expires_at: expiresAt,
  })
  if (insertError) {
    console.error('phone_otp_verifications insert:', insertError.message)
    return { error: insertError.message || 'Could not start verification. Try again.' }
  }

  const result = await sendSMS(phoneNumber, otp)
  if (!result.success) {
    const until = await getOtpSendNotBefore(supabase, user.id)
    return {
      error: 'SMS sending failed. Please try again.',
      cooldownUntil: until?.toISOString(),
    }
  }

  const untilAfterSend = await getOtpSendNotBefore(supabase, user.id)
  return {
    success: true,
    devConsoleOnly: result.devConsoleOnly === true,
    cooldownUntil: untilAfterSend?.toISOString(),
  }
}

export async function verifyPhoneOTP(phoneNumber: string, otpCode: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Find latest non-expired OTP for this user+phone
  const { data: otpRecord } = await supabase
    .from('phone_otp_verifications')
    .select('*')
    .eq('user_id', user.id)
    .eq('phone_number', phoneNumber)
    .eq('verified', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otpRecord) {
    return { error: 'OTP expired or not found. Request a new one.' }
  }

  const { data: phoneTaken } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone_number', phoneNumber)
    .eq('is_phone_verified', true)
    .neq('id', user.id)
    .maybeSingle()

  if (phoneTaken) {
    return { error: 'This phone number is already registered to another account.' }
  }

  // Check attempts
  if (otpRecord.attempts >= MAX_OTP_VERIFY_ATTEMPTS) {
    return { error: 'Too many failed attempts. Request a new OTP.' }
  }

  // Increment attempts
  await supabase
    .from('phone_otp_verifications')
    .update({ attempts: otpRecord.attempts + 1 })
    .eq('id', otpRecord.id)

  // Verify OTP
  if (otpRecord.otp_code !== otpCode) {
    return { error: `Incorrect OTP. ${MAX_OTP_VERIFY_ATTEMPTS - otpRecord.attempts - 1} attempts remaining.` }
  }

  // Mark OTP as verified
  await supabase
    .from('phone_otp_verifications')
    .update({ verified: true })
    .eq('id', otpRecord.id)

  // Update profile: phone verified + phone number
  await supabase
    .from('profiles')
    .update({
      is_phone_verified: true,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  // Check if user qualifies as host (both phone + email verified)
  const isHost = await checkAndSetHostStatus(supabase, user.id)

  revalidatePath('/host/verify')
  revalidatePath('/profile')
  return { success: true, isHost }
}

export async function checkVerificationStatus() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_phone_verified, is_email_verified, is_host, phone_number')
    .eq('id', user.id)
    .single()

  // Check email verification from auth
  const isEmailVerified = !!user.email_confirmed_at

  // Sync email verification to profile if needed
  if (isEmailVerified && !profile?.is_email_verified) {
    await supabase
      .from('profiles')
      .update({ is_email_verified: true })
      .eq('id', user.id)
  }

  const otpCooldownUntil = await getOtpSendNotBefore(supabase, user.id)

  return {
    isPhoneVerified: profile?.is_phone_verified || false,
    isEmailVerified,
    isHost: profile?.is_host || false,
    phoneNumber: profile?.phone_number || null,
    otpSendCooldownUntil: otpCooldownUntil?.toISOString() ?? null,
  }
}

export async function resendEmailVerification() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'No email found' }

  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
  if (error) return { error: error.message }
  return { success: true }
}

// ── Helper ──────────────────────────────────────────────────
async function checkAndSetHostStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_phone_verified, is_email_verified')
    .eq('id', userId)
    .single()

  // Also check auth email confirmation
  const { data: { user } } = await supabase.auth.getUser()
  const emailVerified = !!user?.email_confirmed_at || profile?.is_email_verified

  if (profile?.is_phone_verified && emailVerified) {
    await supabase
      .from('profiles')
      .update({ is_host: true, is_email_verified: true })
      .eq('id', userId)
    return true
  }
  return false
}
