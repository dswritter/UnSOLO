'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS, generateOTP } from '@/lib/sms/client'
import { validateIndianPhone } from '@/lib/utils'
import { MAX_OTP_PER_HOUR, MAX_OTP_VERIFY_ATTEMPTS, OTP_EXPIRY_MINUTES } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

export async function sendPhoneOTP(phoneNumber: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Validate phone format
  if (!validateIndianPhone(phoneNumber)) {
    return { error: 'Enter a valid 10-digit Indian mobile number (starting with 6-9)' }
  }

  // Rate limit: max 3 OTPs per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('phone_otp_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneHourAgo)

  if ((count || 0) >= MAX_OTP_PER_HOUR) {
    return { error: 'Too many OTP requests. Try again in an hour.' }
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
    return { error: result.error || 'Failed to send OTP' }
  }

  return { success: true, devConsoleOnly: result.devConsoleOnly === true }
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

  return {
    isPhoneVerified: profile?.is_phone_verified || false,
    isEmailVerified,
    isHost: profile?.is_host || false,
    phoneNumber: profile?.phone_number || null,
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
