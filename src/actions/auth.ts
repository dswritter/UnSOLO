'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const username = formData.get('username') as string
  const fullName = formData.get('fullName') as string
  const referralCode = formData.get('referralCode') as string | null

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName, referral_code: referralCode || undefined },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Profile is created automatically by the DB trigger `handle_new_user`
  // Link referral if code provided
  if (referralCode && data.user) {
    await linkReferral(data.user.id, referralCode)
  }

  revalidatePath('/', 'layout')
  redirect('/explore')
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/explore')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signInWithGoogle(referralCode?: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      queryParams: referralCode ? { referral_code: referralCode } : undefined,
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
