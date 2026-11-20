import { redirect } from 'next/navigation'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { Composer } from '@/components/tribe/Composer'
import { toUserLite } from '@/lib/tribe/models'
import { todayIST } from '@/lib/tribe/models'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New post · UnSOLO Tribe', robots: { index: false } }

type Props = { searchParams: Promise<{ kind?: string }> }

export default async function NewPostPage({ searchParams }: Props) {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Ftribe%2Fnew')
  const [{ kind }, profile] = await Promise.all([searchParams, getRequestProfile(user.id)])
  // Past UnSOLO trips → "Which trip?" for stories (feeds "From people who went" on the trip page).
  const { data: past } = await supabase.from('bookings').select('package:packages(id, title)')
    .eq('user_id', user.id).in('status', ['confirmed', 'completed']).lt('travel_date', todayIST()).limit(20)
  const pastTrips = [...new Map(((past ?? []) as unknown as { package: { id: string; title: string } | null }[])
    .filter((b) => b.package).map((b) => [b.package!.id, b.package!])).values()]
  const k = kind === 'plan' || kind === 'story' || kind === 'ask' ? kind : null
  return <Composer initialKind={k} me={toUserLite(profile as unknown as Record<string, unknown>)} pastTrips={pastTrips} />
}
