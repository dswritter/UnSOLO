import { redirect } from 'next/navigation'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { Composer } from '@/components/tribe/Composer'
import { toUserLite } from '@/lib/tribe/models'
import { todayIST } from '@/lib/tribe/models'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New post · UnSOLO Tribe', robots: { index: false } }

type Props = { searchParams: Promise<{ kind?: string; poll?: string }> }

export default async function NewPostPage({ searchParams }: Props) {
  const [{ kind, poll }, { supabase, user }] = await Promise.all([searchParams, getRequestAuth()])
  const k = kind === 'plan' || kind === 'story' || kind === 'ask' ? kind : null
  const isPoll = k === 'ask' && poll === '1'
  if (!user) {
    // Come back to the same composer after signing in.
    const back = `/tribe/new${k ? `?kind=${k}${isPoll ? '&poll=1' : ''}` : ''}`
    redirect(`/login?redirectTo=${encodeURIComponent(back)}`)
  }
  const profile = await getRequestProfile(user.id)
  // Past UnSOLO trips → "Which trip?" for stories (feeds "From people who went" on the trip page).
  const { data: past } = await supabase.from('bookings').select('package:packages(id, title)')
    .eq('user_id', user.id).in('status', ['confirmed', 'completed']).lt('travel_date', todayIST()).limit(20)
  const pastTrips = [...new Map(((past ?? []) as unknown as { package: { id: string; title: string } | null }[])
    .filter((b) => b.package).map((b) => [b.package!.id, b.package!])).values()]
  return <Composer initialKind={k} initialPoll={isPoll} me={toUserLite(profile as unknown as Record<string, unknown>)} pastTrips={pastTrips} />
}
