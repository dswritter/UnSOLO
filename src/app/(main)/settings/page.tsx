import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { loadPreferences, DEFAULT_PREFERENCES } from '@/lib/tribe/preferences'
import { SettingsClient } from '@/components/tribe/SettingsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings · UnSOLO', robots: { index: false } }

export default async function SettingsPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Fsettings')
  const [prefs, { data: p }, { data: priv }] = await Promise.all([
    loadPreferences(supabase, user.id).catch(() => DEFAULT_PREFERENCES),
    supabase.from('profiles').select('phone_number, is_phone_verified, is_id_verified').eq('id', user.id).maybeSingle(),
    supabase.from('profile_private').select('gender, home_city').eq('user_id', user.id).maybeSingle(),
  ])
  return (
    <SettingsClient
      initial={prefs}
      me={{
        gender: (priv?.gender as string | null) ?? null,
        homeCity: (priv?.home_city as string | null) ?? null,
        genderLocked: p?.is_id_verified === true,
        phone: (p?.phone_number as string | null) ?? null,
        isPhoneVerified: p?.is_phone_verified === true,
      }}
    />
  )
}
