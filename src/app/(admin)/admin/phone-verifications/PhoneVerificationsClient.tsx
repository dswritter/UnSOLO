'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { manuallyVerifyPhone, denyForeignPhone, processPhoneChangeRequest } from '@/actions/verification'
import { PHONE_COUNTRY_CODES, type SupportedCountryCode } from '@/lib/utils'
import { toast } from 'sonner'
import { Check, X, Phone, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  foreignPending: any[]
  changeRequests: any[]
}

export default function PhoneVerificationsClient({ foreignPending: initialForeign, changeRequests: initialChanges }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [foreignPending, setForeignPending] = useState(initialForeign)
  const [changeRequests, setChangeRequests] = useState(initialChanges)
  const [staffNotes, setStaffNotes] = useState<Record<string, string>>({})

  function countryLabel(code: string) {
    const rule = PHONE_COUNTRY_CODES[code as SupportedCountryCode]
    return rule ? `${rule.flag} ${rule.name}` : code
  }

  function handleVerify(userId: string) {
    startTransition(async () => {
      const res = await manuallyVerifyPhone(userId, staffNotes[userId])
      if ('error' in res && res.error) { toast.error(res.error); return }
      toast.success('Phone verified — host has been notified.')
      setForeignPending((prev) => prev.filter((p) => p.id !== userId))
      router.refresh()
    })
  }

  function handleDeny(userId: string) {
    startTransition(async () => {
      const res = await denyForeignPhone(userId, staffNotes[userId])
      if ('error' in res && res.error) { toast.error(res.error); return }
      toast.success('Phone denied — host has been notified.')
      setForeignPending((prev) => prev.filter((p) => p.id !== userId))
      router.refresh()
    })
  }

  function handleChangeRequest(requestId: string, approve: boolean) {
    startTransition(async () => {
      const res = await processPhoneChangeRequest(requestId, approve, staffNotes[requestId])
      if ('error' in res && res.error) { toast.error(res.error); return }
      toast.success(approve ? 'Phone change approved.' : 'Phone change denied.')
      setChangeRequests((prev) => prev.filter((r) => r.id !== requestId))
      router.refresh()
    })
  }

  const totalPending = foreignPending.length + changeRequests.length

  return (
    <div className="space-y-8">
      {totalPending === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pending verifications</p>
          <p className="text-sm mt-1">New foreign host registrations and phone change requests will appear here.</p>
        </div>
      )}

      {/* Foreign phone verifications */}
      {foreignPending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-400" />
            Pending foreign phone verifications
            <span className="text-xs font-normal text-muted-foreground ml-1">({foreignPending.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">
            Call or message the host on the number below to confirm identity, then mark verified.
          </p>
          <div className="space-y-3">
            {foreignPending.map((host) => (
              <div key={host.id} className="border border-border rounded-xl bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={host.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {(host.full_name || host.username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{host.full_name || host.username}</p>
                    <p className="text-xs text-muted-foreground">@{host.username}</p>
                  </div>
                  <Link href={`/admin/users?search=${host.username}`} className="text-xs text-primary hover:underline shrink-0">
                    View profile
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm bg-secondary/40 rounded-lg px-3 py-2">
                  <span className="text-muted-foreground text-xs">Number to call/message:</span>
                  <span className="font-bold font-mono">{host.phone_country_code} {host.phone_number}</span>
                  <span className="text-xs text-muted-foreground">{countryLabel(host.phone_country_code)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Email verified: </span>
                    <span className={host.is_email_verified ? 'text-emerald-400' : 'text-red-400'}>
                      {host.is_email_verified ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Registered: </span>
                    {formatDate(host.created_at)}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Staff note (optional — sent to host)"
                  value={staffNotes[host.id] || ''}
                  onChange={(e) => setStaffNotes((p) => ({ ...p, [host.id]: e.target.value }))}
                  className="w-full text-xs bg-secondary border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleVerify(host.id)}
                    disabled={isPending}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Mark verified
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeny(host.id)}
                    disabled={isPending}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Deny &amp; clear
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Phone change requests */}
      {changeRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Phone change requests
            <span className="text-xs font-normal text-muted-foreground ml-1">({changeRequests.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">
            Verify the host owns the new number (call/message if foreign), then approve or deny.
          </p>
          <div className="space-y-3">
            {changeRequests.map((req) => {
              const host = req.user as any
              return (
                <div key={req.id} className="border border-border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={host?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {(host?.full_name || host?.username || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{host?.full_name || host?.username}</p>
                      <p className="text-xs text-muted-foreground">@{host?.username}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(req.requested_at)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-secondary/40 rounded-lg px-3 py-2">
                      <p className="text-muted-foreground mb-1">Current number</p>
                      <p className="font-mono font-semibold">
                        {req.current_country_code || '+91'} {req.current_phone || '—'}
                      </p>
                      <p className="text-muted-foreground mt-0.5">{countryLabel(req.current_country_code || '+91')}</p>
                    </div>
                    <div className="bg-primary/10 border border-primary/25 rounded-lg px-3 py-2">
                      <p className="text-muted-foreground mb-1">Requested new number</p>
                      <p className="font-mono font-bold text-primary">
                        {req.new_country_code} {req.new_phone}
                      </p>
                      <p className="text-muted-foreground mt-0.5">{countryLabel(req.new_country_code)}</p>
                    </div>
                  </div>

                  {req.note && (
                    <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
                      <span className="font-medium text-foreground">Host note: </span>{req.note}
                    </p>
                  )}

                  <input
                    type="text"
                    placeholder="Staff note (optional — sent to host)"
                    value={staffNotes[req.id] || ''}
                    onChange={(e) => setStaffNotes((p) => ({ ...p, [req.id]: e.target.value }))}
                    className="w-full text-xs bg-secondary border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                  />

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleChangeRequest(req.id, true)}
                      disabled={isPending}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve change
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleChangeRequest(req.id, false)}
                      disabled={isPending}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Deny
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
