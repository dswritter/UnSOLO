'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CheckCircle2, Landmark, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updatePayoutDetails, type PayoutDetails } from '@/actions/payout'

type Props = {
  initial: PayoutDetails
  onSaved?: () => void
  /** When true, hides the header — useful when embedded under a section title. */
  compact?: boolean
}

export function PayoutDetailsForm({ initial, onSaved, compact }: Props) {
  const [method, setMethod] = useState<'upi' | 'bank'>(initial.payout_method === 'bank' ? 'bank' : 'upi')
  const [upi, setUpi] = useState(initial.upi_id || '')
  const [bankName, setBankName] = useState(initial.bank_account_name || '')
  const [bankAcc, setBankAcc] = useState(initial.bank_account_number || '')
  const [confirmAcc, setConfirmAcc] = useState(initial.bank_account_number || '')
  const [ifsc, setIfsc] = useState(initial.bank_ifsc || '')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    if (method === 'bank' && bankAcc !== confirmAcc) {
      toast.error('Account numbers do not match')
      return
    }
    startTransition(async () => {
      const res = await updatePayoutDetails({
        upi_id: upi || null,
        bank_account_name: bankName || null,
        bank_account_number: bankAcc || null,
        bank_ifsc: ifsc || null,
        payout_method: method,
      })
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Payout details saved')
        onSaved?.()
      }
    })
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h3 className="font-bold">Payout Details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Where should we send your host earnings? You can update these anytime.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMethod('upi')}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
            method === 'upi'
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
        >
          <Smartphone className="h-4 w-4" />
          UPI
          {initial.upi_id && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
        </button>
        <button
          type="button"
          onClick={() => setMethod('bank')}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
            method === 'bank'
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
        >
          <Landmark className="h-4 w-4" />
          Bank Account
          {initial.bank_account_number && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
        </button>
      </div>

      {method === 'upi' ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">UPI ID</label>
          <Input
            placeholder="name@okaxis, name@paytm, 9876543210@upi"
            value={upi}
            onChange={e => setUpi(e.target.value.toLowerCase().trim())}
            className="bg-secondary border-border"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Must contain <code>@</code> (e.g. <code>ravi@okaxis</code>).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account Holder Name</label>
            <Input
              placeholder="As on your bank records"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account Number</label>
            <Input
              placeholder="9–18 digits"
              value={bankAcc}
              onChange={e => setBankAcc(e.target.value.replace(/\D/g, '').slice(0, 18))}
              inputMode="numeric"
              className="bg-secondary border-border font-mono tracking-wider"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Confirm Account Number</label>
            <Input
              placeholder="Re-enter account number"
              value={confirmAcc}
              onChange={e => setConfirmAcc(e.target.value.replace(/\D/g, '').slice(0, 18))}
              inputMode="numeric"
              className={cn(
                'bg-secondary border-border font-mono tracking-wider',
                confirmAcc && bankAcc !== confirmAcc && 'border-red-500/50',
              )}
              autoComplete="off"
            />
            {confirmAcc && bankAcc !== confirmAcc && (
              <p className="text-[11px] text-red-400">Account numbers do not match.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">IFSC Code</label>
            <Input
              placeholder="HDFC0001234"
              value={ifsc}
              onChange={e => setIfsc(e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 11))}
              className="bg-secondary border-border font-mono tracking-wider"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      <Button
        onClick={handleSave}
        disabled={pending}
        className="w-full bg-primary text-primary-foreground font-bold"
      >
        {pending ? 'Saving…' : 'Save Payout Details'}
      </Button>

      <p className="text-[11px] text-muted-foreground text-center">
        Your share of each booking is recorded after successful payment and paid out to the{' '}
        <span className="font-medium">{method === 'upi' ? 'UPI ID' : 'bank account'}</span> above.
      </p>
    </div>
  )
}
