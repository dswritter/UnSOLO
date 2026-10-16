'use client'

import { useState, useTransition } from 'react'
import { formatDate, type CustomDateRequest, type Profile, type Package } from '@/types'
import { updateCustomRequestStatus } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Check, X, Phone, Mail, Calendar, Users } from 'lucide-react'
import { StatusPill } from '@/components/admin/ui/AdminPrimitives'
import { AdminFilterTabs } from '@/components/admin/ui/AdminFilters'


interface Props {
  requests: CustomDateRequest[]
}

export function CustomRequestsClient({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial)
  const [filter, setFilter] = useState('all')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const filtered = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

  function showFeedback(id: string, msg: string) {
    setFeedback(f => ({ ...f, [id]: msg }))
    setTimeout(() => setFeedback(f => { const next = { ...f }; delete next[id]; return next }), 3000)
  }

  function handleStatusUpdate(id: string, status: 'approved' | 'rejected') {
    startTransition(async () => {
      const notesEl = document.getElementById(`req-notes-${id}`) as HTMLTextAreaElement
      const res = await updateCustomRequestStatus(id, status, notesEl?.value || undefined)
      if (res.error) showFeedback(id, `Error: ${res.error}`)
      else {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
        showFeedback(id, `Request ${status}!`)
      }
    })
  }

  return (
    <div>
      <AdminFilterTabs
        className="mb-6"
        tabs={['all', 'pending', 'approved', 'rejected'].map(key => ({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          count: key === 'all' ? requests.length : requests.filter(r => r.status === key).length,
        }))}
        value={filter}
        onChange={setFilter}
      />

      {/* Requests list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-12">No custom date requests found.</p>
        )}

        {filtered.map((req) => {
          const usr = req.user as Profile | null
          const pkg = req.package as { title?: string } | null

          return (
            <div key={req.id} className="rounded-xl border border-border bg-card/50 p-5">
              {feedback[req.id] && (
                <p className={`text-sm px-3 py-2 rounded-lg mb-3 ${feedback[req.id].startsWith('Error') ? 'bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-green-900/30 text-green-700 dark:text-green-300'}`}>
                  {feedback[req.id]}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <StatusPill status={req.status} />
                    <span className="font-semibold">{pkg?.title || 'Unknown Package'}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{usr?.full_name || usr?.username || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(req.requested_date)} · {req.guests} guest{req.guests > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <a href={`tel:${req.contact_number}`} className="hover:text-foreground">{req.contact_number}</a>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <a href={`mailto:${req.contact_email}`} className="hover:text-foreground">{req.contact_email}</a>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">Submitted {formatDate(req.created_at)}</p>
                </div>

                {/* Actions */}
                {req.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <textarea
                      id={`req-notes-${req.id}`}
                      placeholder="Admin notes (optional)"
                      className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs resize-none w-full sm:w-48"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-800 hover:bg-green-700 text-green-100 text-xs gap-1 flex-1"
                        onClick={() => handleStatusUpdate(req.id, 'approved')}
                        disabled={isPending}
                      >
                        <Check className="h-3 w-3" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-800 hover:bg-red-700 text-red-100 text-xs gap-1 flex-1"
                        onClick={() => handleStatusUpdate(req.id, 'rejected')}
                        disabled={isPending}
                      >
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
