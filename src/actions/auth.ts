'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Maps Supabase Auth errors to clearer copy (rate limits, etc.). */
function mapAuthErrorMessage(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('email rate limit') ||
    (lower.includes('rate limit') && lower.includes('email')) ||
    lower.includes('too many emails')
  ) {
    return (
      'Too many confirmation emails were sent recently (Supabase limit). Wait an hour and try again, use Google sign-up, ' +
      'or fix it in production: Supabase Dashboard → Authentication → Emails → configure custom SMTP (raises email limits), ' +
      'and Authentication → Rate Limits for other auth caps.'
    )
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }
  return message
}

export type SignUpResult =
  | { error: string }
  | { needsEmailConfirmation: true; email: string }

function normalizeRedirectTarget(value: string | null | undefined): string {
  if (!value) return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

async function resolveAppUrl(): Promise<string> {
  const hdrs = await headers()
  const origin = hdrs.get('origin')
  if (origin) {
    try {
      return new URL(origin).origin
    } catch {}
  }

  const proto = hdrs.get('x-forwarded-proto')
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host')
  if (host) {
    return `${proto ?? 'https'}://${host}`
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) {
    try {
      return new URL(envUrl).origin
    } catch {}
  }

  return ''
}

export async function signUp(formData: FormData): Promise<SignUpResult | void> {
  const supabase = await createClient()

  const email = (formData.get('email') as string)?.trim() || ''
  const password = formData.get('password') as string
  const username = formData.get('username') as string
  const fullName = formData.get('fullName') as string
  const referralCode = formData.get('referralCode') as string | null
  const redirectTo = normalizeRedirectTarget(formData.get('redirectTo') as string | null)

  const appUrl = await resolveAppUrl()
  const confirmNext = encodeURIComponent(
    `/login?verified=1&redirectTo=${encodeURIComponent(redirectTo)}`
  )

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName, referral_code: referralCode || undefined },
      emailRedirectTo: `${appUrl}/auth/callback?next=${confirmNext}`,
    },
  })

  if (error) {
    return { error: mapAuthErrorMessage(error.message) }
  }

  // Profile is created automatically by the DB trigger `handle_new_user`
  // Link referral if code provided
  if (referralCode && data.user) {
    await linkReferral(data.user.id, referralCode)
  }

  // Email confirmation enabled: no session until user clicks link in inbox
  if (!data.session) {
    return { needsEmailConfirmation: true, email }
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = normalizeRedirectTarget(formData.get('redirectTo') as string | null)

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message
    if (/email not confirmed|not confirmed/i.test(msg)) {
      return {
        error:
          'This email is not verified yet. Open the confirmation link we sent you, then sign in. You can resend the email from the sign-up page if needed.',
      }
    }
    return { error: msg }
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  revalidatePath('/', 'layout')
  redirect('/')
}

/** Resend signup confirmation (user not logged in yet). Uses same redirect as sign-up. */
export async function resendSignupConfirmationEmail(email: string, redirectTo?: string) {
  const supabase = await createClient()
  const appUrl = await resolveAppUrl()
  const nextTarget = normalizeRedirectTarget(redirectTo)
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(`/login?verified=1&redirectTo=${encodeURIComponent(nextTarget)}`)}`,
    },
  })
  if (error) return { error: mapAuthErrorMessage(error.message) }
  return { success: true as const }
}

type OAuthSignInOptions = {
  redirectTo?: string | null
  referralCode?: string | null
}

export async function signInWithGoogle(options?: OAuthSignInOptions) {
  const supabase = await createClient()
  const appUrl = await resolveAppUrl()
  const redirectTo = normalizeRedirectTarget(options?.redirectTo)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      queryParams: options?.referralCode ? { referral_code: options.referralCode } : undefined,
    },
  })
  if (error) return { error: error.message }
  if (data.url) redirect(data.url)
}

export async function signInWithApple(options?: OAuthSignInOptions) {
  const supabase = await createClient()
  const appUrl = await resolveAppUrl()
  const redirectTo = normalizeRedirectTarget(options?.redirectTo)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      queryParams: options?.referralCode ? { referral_code: options.referralCode } : undefined,
    },
  })
  if (error) return { error: error.message }
  if (data.url) redirect(data.url)
}

// ── Link Referral ─────────────────────────────────────────────
async function linkReferral(userId: string, referralCode: string) {
  try {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Find referrer by code
    const { data: referrer } = await svcSupabase
      .from('profiles')
      .select('id, full_name, username')
      .eq('referral_code', referralCode.toUpperCase())
      .single()

    if (!referrer || referrer.id === userId) return // can't refer yourself

    // Set referred_by on new user's profile
    await svcSupabase
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', userId)

    // Create referral tracking row
    await svcSupabase
      .from('referrals')
      .insert({
        referrer_id: referrer.id,
        referred_id: userId,
        status: 'pending',
      })

    // Notify referrer
    await svcSupabase.from('notifications').insert({
      user_id: referrer.id,
      type: 'booking',
      title: 'New Referral!',
      body: 'Someone signed up using your referral code. You\'ll earn ₹500 when they complete their first booking!',
      link: '/profile',
    })
  } catch {
    // Non-critical — don't block signup
  }
}

export { linkReferral }
