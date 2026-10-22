import { redirect } from 'next/navigation'
import { checkVerificationStatus } from '@/actions/verification'
import { getPayoutDetails } from '@/actions/payout'
import { HostVerifyClient } from './HostVerifyClient'

export default async function HostVerifyPage() {
  const [status, payout] = await Promise.all([
    checkVerificationStatus(),
    getPayoutDetails(),
  ])
  if (!status) redirect('/login?redirectTo=/host/verify')
  if ('error' in payout) throw new Error(payout.error)
  return <HostVerifyClient status={status} initialPayout={payout} />
}
