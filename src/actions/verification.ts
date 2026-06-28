'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { sendSMS, generateOTP } from '@/lib/sms/client'
import { validateIndianPhone, validatePhone, PHONE_COUNTRY_CODES, type SupportedCountryCode } from '@/lib/utils'
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
  const { supabase, user } = await getActionAuth()
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
  const { supabase, user } = await getActionAuth()
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
  const { supabase, user } = await getActionAuth()
  if (!user) return null

  const [{ data: profile }, { data: pendingChange }] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_phone_verified, is_email_verified, is_host, phone_number, phone_country_code, phone_verified_method')
      .eq('id', user.id)
      .single(),
    supabase
      .from('phone_change_requests')
      .select('id, new_phone, new_country_code, status, requested_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const isEmailVerified = !!user.email_confirmed_at

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
    phoneCountryCode: (profile?.phone_country_code as string | null) || '+91',
    phoneVerifiedMethod: (profile?.phone_verified_method as string | null) || null,
    pendingChangeRequest: pendingChange
      ? {
          id: pendingChange.id as string,
          newPhone: pendingChange.new_phone as string,
          newCountryCode: pendingChange.new_country_code as string,
          requestedAt: pendingChange.requested_at as string,
        }
      : null,
    otpSendCooldownUntil: otpCooldownUntil?.toISOString() ?? null,
  }
}

export async function resendEmailVerification() {
  const { supabase, user } = await getActionAuth()
  if (!user?.email) return { error: 'No email found' }

  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
  if (error) return { error: error.message }
  return { success: true }
}

// ── Foreign phone (manual review) ───────────────────────────

/** Submit a non-Indian phone number for manual review by staff. */
export async function submitForeignPhoneForReview(phone: string, countryCode: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const rule = PHONE_COUNTRY_CODES[countryCode as SupportedCountryCode]
  if (!rule || rule.otp) return { error: 'Use OTP verification for Indian numbers.' }

  const clean = validatePhone(phone, countryCode)
  if (!clean) {
    return { error: `Enter a valid ${rule.digits}-digit ${rule.name} mobile number.` }
  }

  // Check uniqueness against already-verified phones
  const svc = createServiceRoleClient()
  const { data: taken } = await svc
    .from('profiles')
    .select('id')
    .eq('phone_number', clean)
    .eq('is_phone_verified', true)
    .neq('id', user.id)
    .maybeSingle()
  if (taken) return { error: 'This phone number is already registered to another account.' }

  // Store on profile — explicitly keep is_phone_verified false (guard against any DB trigger)
  const { error: updateErr } = await svc
    .from('profiles')
    .update({ phone_number: clean, phone_country_code: countryCode, is_phone_verified: false, is_host: false })
    .eq('id', user.id)
  if (updateErr) return { error: updateErr.message }

  // Notify all admin + host_onboarding_staff
  const { data: staffProfiles } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'host_onboarding_staff'])
  const { data: staffMembers } = await svc
    .from('team_members')
    .select('user_id')
    .in('role', ['admin', 'host_onboarding_staff'])
    .eq('is_active', true)

  const { data: selfProfile } = await svc.from('profiles').select('full_name, username').eq('id', user.id).single()
  const displayName = (selfProfile?.full_name as string | null) || (selfProfile?.username as string | null) || 'A host'
  const staffIds = [
    ...new Set([
      ...(staffProfiles || []).map((p) => p.id as string),
      ...(staffMembers || []).map((m) => m.user_id as string),
    ]),
  ].filter((id) => id !== user.id)

  if (staffIds.length > 0) {
    await svc.from('notifications').insert(
      staffIds.map((staffId) => ({
        user_id: staffId,
        type: 'booking',
        title: 'Foreign host phone — manual verification needed',
        body: `${displayName} submitted a ${rule.name} number (${countryCode} ${clean}) for manual verification.`,
        link: '/admin/phone-verifications',
      })),
    )
  }

  revalidatePath('/host/verify')
  return { success: true }
}

// ── Phone change requests ────────────────────────────────────

/** Verified host requests a phone number change. Staff must approve before it takes effect. */
export async function requestPhoneChange(newPhone: string, newCountryCode: string, note?: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const rule = PHONE_COUNTRY_CODES[newCountryCode as SupportedCountryCode]
  if (!rule) return { error: 'Unsupported country code.' }

  const clean = validatePhone(newPhone, newCountryCode)
  if (!clean) {
    return { error: `Enter a valid ${rule.digits}-digit ${rule.name} mobile number.` }
  }

  const svc = createServiceRoleClient()

  const { data: profile } = await svc
    .from('profiles')
    .select('is_phone_verified, phone_number, phone_country_code')
    .eq('id', user.id)
    .single()

  if (!profile?.is_phone_verified) return { error: 'Your current number must be verified first.' }

  if (profile.phone_number === clean && profile.phone_country_code === newCountryCode) {
    return { error: 'That is already your verified phone number.' }
  }

  // Cancel any existing pending request
  await svc
    .from('phone_change_requests')
    .update({ status: 'denied', staff_note: 'Superseded by a new request.' })
    .eq('user_id', user.id)
    .eq('status', 'pending')

  // Check new number not already taken
  const { data: taken } = await svc
    .from('profiles')
    .select('id')
    .eq('phone_number', clean)
    .eq('is_phone_verified', true)
    .neq('id', user.id)
    .maybeSingle()
  if (taken) return { error: 'This phone number is already registered to another account.' }

  const { error: insertErr } = await supabase.from('phone_change_requests').insert({
    user_id: user.id,
    current_phone: profile.phone_number as string | null,
    current_country_code: (profile.phone_country_code as string | null) || '+91',
    new_phone: clean,
    new_country_code: newCountryCode,
    note: note?.trim() || null,
  })
  if (insertErr) return { error: insertErr.message }

  // Notify staff
  const { data: staffProfiles } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'host_onboarding_staff'])
  const { data: staffMembers } = await svc
    .from('team_members')
    .select('user_id')
    .in('role', ['admin', 'host_onboarding_staff'])
    .eq('is_active', true)

  const { data: selfProfile } = await svc.from('profiles').select('full_name, username').eq('id', user.id).single()
  const displayName = (selfProfile?.full_name as string | null) || (selfProfile?.username as string | null) || 'A host'
  const staffIds = [
    ...new Set([
      ...(staffProfiles || []).map((p) => p.id as string),
      ...(staffMembers || []).map((m) => m.user_id as string),
    ]),
  ].filter((id) => id !== user.id)

  if (staffIds.length > 0) {
    await svc.from('notifications').insert(
      staffIds.map((staffId) => ({
        user_id: staffId,
        type: 'booking',
        title: 'Phone number change request',
        body: `${displayName} wants to change their phone to ${newCountryCode} ${clean}.`,
        link: '/admin/phone-verifications',
      })),
    )
  }

  revalidatePath('/host/verify')
  return { success: true }
}

/** Cancel own pending phone change request. */
export async function cancelPhoneChangeRequest() {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  await supabase
    .from('phone_change_requests')
    .update({ status: 'denied', staff_note: 'Cancelled by host.' })
    .eq('user_id', user.id)
    .eq('status', 'pending')
  revalidatePath('/host/verify')
  return { success: true }
}

// ── Staff actions ────────────────────────────────────────────

/** Staff: approve a foreign host's pending manual phone verification. */
export async function manuallyVerifyPhone(userId: string, staffNote?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()
  const { data: staff } = await svc
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const { data: membership } = await svc
    .from('team_members')
    .select('role, is_active, custom_permissions')
    .eq('user_id', user.id)
    .maybeSingle()
  const { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } = await import('@/types')
  const effRole = (staff?.role as string | undefined) || (membership?.is_active ? (membership.role as string | undefined) : undefined)
  const perms = effRole === 'custom' ? (membership?.custom_permissions as string[] || []) : (ROLE_DEFAULT_PERMISSIONS[effRole as keyof typeof ROLE_DEFAULT_PERMISSIONS] || [])
  if (!hasAdminPermission(effRole as never, perms as never, 'phone_verifications')) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await svc
    .from('profiles')
    .select('phone_number, phone_country_code, is_email_verified')
    .eq('id', userId)
    .single()
  if (!profile?.phone_number) return { error: 'No pending phone found for this user.' }

  await svc
    .from('profiles')
    .update({ is_phone_verified: true, phone_verified_method: 'manual' })
    .eq('id', userId)

  // Grant host status if email also verified
  if (profile.is_email_verified) {
    await svc.from('profiles').update({ is_host: true }).eq('id', userId)
  }

  const rule = PHONE_COUNTRY_CODES[(profile.phone_country_code as SupportedCountryCode) || '+91']
  await svc.from('notifications').insert({
    user_id: userId,
    type: 'booking',
    title: 'Phone verified — you can now host!',
    body: `Your ${rule?.name || ''} number (${profile.phone_country_code} ${profile.phone_number}) has been verified. Head to your host dashboard to create your first trip.${staffNote ? ` Note: ${staffNote}` : ''}`,
    link: '/host',
  })

  revalidatePath('/admin/phone-verifications')
  return { success: true }
}

/** Staff: deny / clear a pending foreign phone submission. */
export async function denyForeignPhone(userId: string, staffNote?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()
  const { data: staff } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const { data: membership } = await svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle()
  const { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } = await import('@/types')
  const effRole = (staff?.role as string | undefined) || (membership?.is_active ? (membership.role as string | undefined) : undefined)
  const perms = effRole === 'custom' ? (membership?.custom_permissions as string[] || []) : (ROLE_DEFAULT_PERMISSIONS[effRole as keyof typeof ROLE_DEFAULT_PERMISSIONS] || [])
  if (!hasAdminPermission(effRole as never, perms as never, 'phone_verifications')) {
    return { error: 'Unauthorized' }
  }

  await svc
    .from('profiles')
    .update({ phone_number: null, phone_country_code: '+91' })
    .eq('id', userId)

  await svc.from('notifications').insert({
    user_id: userId,
    type: 'booking',
    title: 'Phone verification not approved',
    body: `We could not verify your phone number.${staffNote ? ` Reason: ${staffNote}` : ' Please re-submit or contact support.'}`,
    link: '/host/verify',
  })

  revalidatePath('/admin/phone-verifications')
  return { success: true }
}

/** Staff: approve or deny a phone change request. */
export async function processPhoneChangeRequest(
  requestId: string,
  approve: boolean,
  staffNote?: string,
) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()
  const { data: staff } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const { data: membership } = await svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle()
  const { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } = await import('@/types')
  const effRole = (staff?.role as string | undefined) || (membership?.is_active ? (membership.role as string | undefined) : undefined)
  const perms = effRole === 'custom' ? (membership?.custom_permissions as string[] || []) : (ROLE_DEFAULT_PERMISSIONS[effRole as keyof typeof ROLE_DEFAULT_PERMISSIONS] || [])
  if (!hasAdminPermission(effRole as never, perms as never, 'phone_verifications')) {
    return { error: 'Unauthorized' }
  }

  const { data: req } = await svc
    .from('phone_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .single()
  if (!req) return { error: 'Request not found or already processed.' }

  await svc
    .from('phone_change_requests')
    .update({
      status: approve ? 'approved' : 'denied',
      staff_note: staffNote?.trim() || null,
      processed_at: new Date().toISOString(),
      processed_by: user.id,
    })
    .eq('id', requestId)

  if (approve) {
    await svc
      .from('profiles')
      .update({
        phone_number: req.new_phone,
        phone_country_code: req.new_country_code,
        is_phone_verified: true,
      })
      .eq('id', req.user_id)
  }

  const rule = PHONE_COUNTRY_CODES[(req.new_country_code as SupportedCountryCode) || '+91']
  await svc.from('notifications').insert({
    user_id: req.user_id as string,
    type: 'booking',
    title: approve ? 'Phone number updated' : 'Phone change not approved',
    body: approve
      ? `Your phone has been updated to ${req.new_country_code} ${req.new_phone}.`
      : `Your request to change to ${rule?.name || ''} number ${req.new_country_code} ${req.new_phone} was not approved.${staffNote ? ` Reason: ${staffNote}` : ''}`,
    link: '/host/verify',
  })

  revalidatePath('/admin/phone-verifications')
  return { success: true }
}

/** Staff: fetch pending foreign phone verifications + pending change requests. */
export async function getPendingPhoneVerifications() {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()
  const { data: staff } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const { data: membership } = await svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle()
  const { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } = await import('@/types')
  const effRole = (staff?.role as string | undefined) || (membership?.is_active ? (membership.role as string | undefined) : undefined)
  const perms = effRole === 'custom' ? (membership?.custom_permissions as string[] || []) : (ROLE_DEFAULT_PERMISSIONS[effRole as keyof typeof ROLE_DEFAULT_PERMISSIONS] || [])
  if (!hasAdminPermission(effRole as never, perms as never, 'phone_verifications')) {
    return { error: 'Unauthorized' }
  }

  const [{ data: foreignPending }, { data: changeRequests }] = await Promise.all([
    // Profiles with a foreign phone submitted but not yet verified
    svc
      .from('profiles')
      .select('id, full_name, username, avatar_url, phone_number, phone_country_code, created_at, is_email_verified')
      .not('phone_number', 'is', null)
      .eq('is_phone_verified', false)
      .neq('phone_country_code', '+91')
      .order('created_at', { ascending: false }),
    // All pending phone change requests with requester info
    svc
      .from('phone_change_requests')
      .select('*, user:profiles!phone_change_requests_user_id_fkey(id, full_name, username, avatar_url, phone_number, phone_country_code)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false }),
  ])

  return {
    foreignPending: foreignPending || [],
    changeRequests: changeRequests || [],
  }
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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const emailVerified = !!session?.user?.email_confirmed_at || profile?.is_email_verified

  if (profile?.is_phone_verified && emailVerified) {
    await supabase
      .from('profiles')
      .update({ is_host: true, is_email_verified: true, phone_public: true })
      .eq('id', userId)
    return true
  }
  return false
}
