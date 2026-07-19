'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { processTripClaim } from '@/actions/trip-claims'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export type PendingClaimRow = {
  id: string
  claimant: { username: string | null; full_name: string | null; avatar_url: string | null } | null
  claimed_traveller_name: string | null
  confirmation_code_entered: string
  linked_review_id: string | null
  created_at: string
  package?: { title: string; slug: string } | null
  booking?: { confirmation_code: string | null } | null
}

/**
 * Shared approve/deny UI for trip-companion join requests — rendered on the
 * booker's My Bookings, the host's trip page, and the admin moderation page.
 * Whoever acts first wins; the row disappears from local state immediately,
 * and (server-side) from the other two contexts' next load since they all
 * query status='pending'.
 */
export function PendingClaimsList({
  claims,
  context,
}: {
  claims: PendingClaimRow[]
  context: 'booker' | 'host' | 'admin'
}) {
  const [items, setItems] = useState(claims)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  if (items.length === 0) return null

  function act(claimId: string, approve: boolean) {
    if (!approve && !confirm('Deny this request? The person will be notified, optionally with your note.')) return
    setBusyId(claimId)
    startTransition(async () => {
      const res = await processTripClaim(claimId, approve, noteDrafts[claimId])
      setBusyId(null)
      if (res.error) { toast.error(res.error); return }
      toast.success(approve ? 'Approved — they now have chat + booking access.' : 'Declined — they were notified.')
      setItems((prev) => prev.filter((c) => c.id !== claimId))
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 mb-6">
      <h2 className="font-bold text-sm flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-amber-400" /> Trip join requests ({items.length})
      </h2>
      <div className="space-y-2">
        {items.map((c) => {
          const busy = isPending && busyId === c.id
          return (
            <div key={c.id} className="rounded-lg border border-border bg-card/60 p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{c.claimant?.full_name || c.claimant?.username || 'Someone'}</span>
                  {c.claimant?.username && <span className="text-muted-foreground"> @{c.claimant.username}</span>}
                  <span className="text-muted-foreground">
                    {' '}says they were on {context === 'admin' && c.package ? `"${c.package.title}"` : 'this trip'}
                  </span>
                  {c.linked_review_id && <span className="text-muted-foreground"> · left a review pending with this request</span>}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(c.created_at)}</span>
              </div>
              {c.claimed_traveller_name && (
                <p className="text-xs text-muted-foreground">
                  Says they&apos;re traveller: <span className="text-foreground">{c.claimed_traveller_name}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Verified against booking confirmation code: <span className="font-mono text-foreground">{c.confirmation_code_entered}</span>
              </p>
              <input
                placeholder="Note (optional, shown to them if you deny)"
                value={noteDrafts[c.id] || ''}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => act(c.id, true)} disabled={busy}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => act(c.id, false)} disabled={busy}>
                  Deny
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
