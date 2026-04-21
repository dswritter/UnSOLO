import { redirect } from 'next/navigation'
import { HostTripForm } from '@/components/hosting/HostTripForm'
import { checkIsHost } from '@/actions/hosting'
import { hasPayoutConfigured } from '@/actions/payout'
import { createClient } from '@/lib/supabase/server'

export default async function CreateTripPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await hasPayoutConfigured(user.id))) {
    redirect(`/host/payout?returnTo=${encodeURIComponent('/host/create')}`)
  }

  const { draft } = await searchParams
  return <HostTripForm resumeDraftId={draft} />
}
