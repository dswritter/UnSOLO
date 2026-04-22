'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users2, X, Check, Clock, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  inviteServiceListingCollaborator,
  listServiceListingCollaborators,
  removeServiceListingCollaborator,
  toggleCollaboratorNotifyOnBooking,
} from '@/actions/host-service-collaborators'
import type { ServiceListingCollaborator } from '@/types'

interface Props {
  listingId: string
  /** Current user is the listing's primary host. Co-hosts see the read-only view. */
  isPrimaryHost: boolean
}

/**
 * Co-host management for a single listing. Only the primary host can invite or
 * remove; co-hosts see the list read-only. Invites send an in-app notification
 * to the invitee; acceptance happens from `/host/invitations`.
 */
export function CoHostSection({ listingId, isPrimaryHost }: Props) {
  const [collaborators, setCollaborators] = useState<ServiceListingCollaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [handle, setHandle] = useState('')
  const [inviting, setInviting] = useState(false)

  async function load() {
    const res = await listServiceListingCollaborators(listingId)
    if ('error' in res) {
      toast.error(res.error)
    } else {
      setCollaborators(res.collaborators)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  async function handleInvite() {
    const v = handle.trim()
    if (!v) return
    setInviting(true)
    const res = await inviteServiceListingCollaborator(listingId, v)
    setInviting(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Invite sent')
    setHandle('')
    load()
  }

  async function handleRemove(id: string) {
    const res = await removeServiceListingCollaborator(id)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Removed')
    load()
  }

  async function handleToggleNotify(id: string, next: boolean) {
    const res = await toggleCollaboratorNotifyOnBooking(id, next)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setCollaborators(prev => prev.map(c => c.id === id ? { ...c, notify_on_booking: next } : c))
  }

  const acceptedCount = collaborators.filter(c => c.status === 'accepted').length

  return (
    <div className="space-y-3 pt-4 border-t border-border/60">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5 text-primary" /> Co-hosts
          </label>
          <p className="text-xs text-muted-foreground">
            Add up to 10 co-hosts. They can edit this listing and see bookings. Payouts and ownership stay with you.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{acceptedCount}/10</span>
      </div>

      {isPrimaryHost && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Username or email"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleInvite() }
            }}
            disabled={inviting || acceptedCount >= 10}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInvite}
            disabled={inviting || !handle.trim() || acceptedCount >= 10}
          >
            {inviting ? 'Sending…' : 'Invite'}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : collaborators.length === 0 ? (
        <p className="text-xs text-muted-foreground">No co-hosts yet.</p>
      ) : (
        <div className="space-y-1.5">
          {collaborators.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {c.profile?.full_name || c.profile?.username || 'User'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  @{c.profile?.username ?? '—'}
                </div>
              </div>
              {c.status === 'pending' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  <Clock className="h-3 w-3" /> pending
                </span>
              )}
              {c.status === 'accepted' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] font-medium text-green-400">
                  <Check className="h-3 w-3" /> accepted
                </span>
              )}
              {c.status === 'declined' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  declined
                </span>
              )}
              {isPrimaryHost && c.status === 'accepted' && (
                <button
                  type="button"
                  onClick={() => handleToggleNotify(c.id, !c.notify_on_booking)}
                  title={c.notify_on_booking ? 'Notifications on' : 'Notifications off'}
                  className={`p-1 rounded transition-colors ${
                    c.notify_on_booking ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label={c.notify_on_booking ? 'Disable booking notifications' : 'Enable booking notifications'}
                >
                  <Bell className="h-3.5 w-3.5" />
                </button>
              )}
              {isPrimaryHost && (
                <button
                  type="button"
                  onClick={() => handleRemove(c.id)}
                  className="p-1 text-muted-foreground hover:text-red-500"
                  aria-label="Remove co-host"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
