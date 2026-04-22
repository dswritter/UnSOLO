'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { respondToCollaboratorInvite } from '@/actions/host-service-collaborators'
import { Button } from '@/components/ui/button'
import type { ServiceListingCollaborator } from '@/types'

type Invite = ServiceListingCollaborator & {
  listing_title: string
  listing_slug: string
  listing_type: string
}

export function InvitationsList({ invites: initial }: { invites: Invite[] }) {
  const [invites, setInvites] = useState(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function respond(id: string, response: 'accepted' | 'declined') {
    setPendingId(id)
    const res = await respondToCollaboratorInvite(id, response)
    setPendingId(null)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(response === 'accepted' ? 'Invite accepted' : 'Invite declined')
    setInvites(prev => prev.filter(i => i.id !== id))
    startTransition(() => router.refresh())
  }

  if (invites.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">No pending invites.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {invites.map(inv => (
        <div key={inv.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{inv.listing_title}</h3>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {inv.listing_type.replace('_', ' ')} · invited by{' '}
                {inv.profile?.full_name || inv.profile?.username || 'a host'}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond(inv.id, 'declined')}
                disabled={pendingId === inv.id}
              >
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => respond(inv.id, 'accepted')}
                disabled={pendingId === inv.id}
              >
                {pendingId === inv.id ? '…' : 'Accept'}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
