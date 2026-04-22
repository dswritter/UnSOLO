'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Users2, X, Check, Clock, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  inviteServiceListingCollaborator,
  listServiceListingCollaborators,
  removeServiceListingCollaborator,
  searchCohostCandidates,
  toggleCollaboratorNotifyOnBooking,
} from '@/actions/host-service-collaborators'
import type { ServiceListingCollaborator } from '@/types'

type Candidate = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

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
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const searchTokenRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = handle.trim()
    if (q.length < 2) {
      setCandidates([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const token = ++searchTokenRef.current
      const res = await searchCohostCandidates(listingId, q)
      if (token !== searchTokenRef.current) return
      setCandidates(res.candidates)
      setShowDropdown(res.candidates.length > 0)
      setActiveIdx(-1)
    }, 180)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [handle, listingId])

  async function submitInvite(value: string) {
    const v = value.trim()
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
    setCandidates([])
    setShowDropdown(false)
    setActiveIdx(-1)
    load()
  }

  function handleInvite() {
    submitInvite(handle)
  }

  function pickCandidate(c: Candidate) {
    if (c.username) {
      submitInvite(c.username)
    } else {
      // No username set — let the server fall back to email resolution
      // by name-pattern; very unlikely path, just keep UI responsive.
      submitInvite(c.full_name ?? '')
    }
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
        <div className="flex gap-2 relative">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by name, username or email"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onFocus={() => {
                if (candidates.length > 0) setShowDropdown(true)
              }}
              onBlur={() => {
                // Let click handlers on dropdown items fire before it unmounts.
                setTimeout(() => setShowDropdown(false), 150)
              }}
              onKeyDown={(e) => {
                if (!showDropdown || candidates.length === 0) {
                  if (e.key === 'Enter') { e.preventDefault(); handleInvite() }
                  return
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIdx(i => (i + 1) % candidates.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIdx(i => (i <= 0 ? candidates.length - 1 : i - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (activeIdx >= 0 && activeIdx < candidates.length) {
                    pickCandidate(candidates[activeIdx])
                  } else {
                    handleInvite()
                  }
                } else if (e.key === 'Escape') {
                  setShowDropdown(false)
                  setActiveIdx(-1)
                }
              }}
              disabled={inviting || acceptedCount >= 10}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
            {showDropdown && candidates.length > 0 && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover shadow-lg max-h-64 overflow-y-auto"
              >
                {candidates.map((c, idx) => (
                  <button
                    type="button"
                    key={c.id}
                    role="option"
                    aria-selected={idx === activeIdx}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCandidate(c)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      idx === activeIdx ? 'bg-secondary' : 'hover:bg-secondary/60'
                    }`}
                  >
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {c.full_name || c.username || 'User'}
                      </div>
                      {c.username && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          @{c.username}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
