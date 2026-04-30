import { redirect } from 'next/navigation'
import { HostTripForm } from '@/components/hosting/HostTripForm'
import { checkIsHost } from '@/actions/hosting'
import { hasPayoutConfigured } from '@/actions/payout'
import { getRequestAuth } from '@/lib/auth/request-session'

export default async function CreateTripPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  if (!(await hasPayoutConfigured(user.id))) {
    redirect(`/host/payout?returnTo=${encodeURIComponent('/host/create')}`)
  }

  const { draft } = await searchParams
  return <HostTripForm resumeDraftId={draft} />
}
