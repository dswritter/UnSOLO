import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPayoutDetails } from '@/actions/payout'
import { PayoutDetailsForm } from '@/components/hosting/PayoutDetailsForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Wallet } from 'lucide-react'

export default async function PayoutDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/host/payout')

  const payout = await getPayoutDetails()
  if ('error' in payout) redirect('/host/verify')

  const { returnTo } = await searchParams
  const backHref = returnTo && returnTo.startsWith('/') ? returnTo : '/host'

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-10">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-black">Payout Details</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Add or update the UPI ID or bank account where we&apos;ll send your host earnings. You can change this anytime.
        </p>

        <div className="rounded-xl border border-border bg-card p-5">
          <PayoutDetailsForm initial={payout} compact />
        </div>

        <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs">
          <p className="font-semibold text-foreground">Fair-split refunds</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            If a traveler cancels, UnSOLO and you share the refund proportionally — you only absorb your share,
            never ours. Platform fees, promos, and discounts never come out of your pocket.{' '}
            <Link href="/refund-policy" className="text-primary hover:underline">See refund policy</Link>.
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
          <p>
            Earnings are paid out on a regular cycle to the details above. Each payout&apos;s status shows up under
            your host earnings.
          </p>
        </div>

        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline">
            <Link href={backHref}>Done</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
