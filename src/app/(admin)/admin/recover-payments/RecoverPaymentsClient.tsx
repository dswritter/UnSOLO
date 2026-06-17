'use client'

import React, { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, LifeBuoy } from 'lucide-react'
import type { OrphanedPayment } from '@/actions/admin'

interface Props {
  scan: (sinceDays?: number) => Promise<{ orphans?: OrphanedPayment[]; error?: string }>
  recover: (orderId: string) => Promise<{ success?: boolean; info?: string; error?: string; bookingId?: string; fullyPaid?: boolean }>
}

export function RecoverPaymentsClient({ scan, recover }: Props) {
  const [orphans, setOrphans] = useState<OrphanedPayment[] | null>(null)
  const [sinceDays, setSinceDays] = useState(14)
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleScan() {
    startTransition(async () => {
      const res = await scan(sinceDays)
      if (res.error) { toast.error(res.error); return }
      setOrphans(res.orphans || [])
      setResolved({})
      toast.success(`${res.orphans?.length ?? 0} orphaned payment(s) found`)
    })
  }

  function handleRecover(orderId: string) {
    startTransition(async () => {
      const res = await recover(orderId)
      if (res.error) { toast.error(res.error); return }
      if (res.info) { setResolved(p => ({ ...p, [orderId]: res.info! })); toast(res.info); return }
      setResolved(p => ({ ...p, [orderId]: res.fullyPaid ? 'Recovered (paid in full)' : 'Recovered (balance due)' }))
      toast.success('Booking recovered')
    })
  }

  const fmt = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Last</label>
        <input
          type="number"
          min={1}
          max={90}
          value={sinceDays}
          onChange={e => setSinceDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
          className="w-16 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm"
        />
        <label className="text-sm text-muted-foreground">days</label>
        <Button onClick={handleScan} disabled={isPending} className="bg-primary text-primary-foreground">
          <RefreshCw className="mr-2 h-4 w-4" /> {isPending ? 'Scanning…' : 'Scan captured payments'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Lists Razorpay payments that were captured but have no booking row. Recovering rebuilds a confirmed
        booking from the order notes and notifies the traveler. Safe to re-run — it skips orders that already
        have a booking.
      </p>

      {orphans?.length === 0 && (
        <p className="text-sm text-green-600 dark:text-green-400">No orphaned payments — every captured payment has a booking. 🎉</p>
      )}

      {orphans && orphans.length > 0 && (
        <div className="space-y-2">
          {orphans.map(o => {
            const status = resolved[o.orderId]
            return (
              <div key={o.paymentId} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{fmt(o.amountPaise)}</span>
                    <code className="text-[11px] text-muted-foreground font-mono">{o.orderId}</code>
                    <span className="text-xs text-muted-foreground">{new Date(o.capturedAt * 1000).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {o.email || o.contact || 'unknown contact'}
                    {o.notes.packageTitle ? ` · ${o.notes.packageTitle}` : ''}
                    {o.notes.travelDate ? ` · ${o.notes.travelDate}` : ''}
                    {o.notes.guests ? ` · ${o.notes.guests} guest(s)` : ''}
                  </div>
                </div>
                {status ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">{status}</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleRecover(o.orderId)} className="border-border shrink-0">
                    <LifeBuoy className="mr-2 h-4 w-4" /> Recover
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
