'use client'

import { useState, useTransition } from 'react'
import { formatDate, type CustomDateRequest, type Profile, type Package } from '@/types'
import { updateCustomRequestStatus } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Phone, Mail, Calendar, Users } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  approved: 'bg-green-900/50 text-green-300 border-green-700',
  rejected: 'bg-red-900/50 text-red-300 border-red-700',
}

interface Props {
  requests: CustomDateRequest[]
}

export function CustomRequestsClient({ requests: initial }: Props) {
  const [filter, setFilter] = useState('all')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const filtered = filter === 'all'
    ? initial
    : initial.filter(r => r.status === filter)

  function showFeedback(id: string, msg: string) {
    setFeedback(f => ({ ...f, [id]: msg }))
    setTimeout(() => setFeedback(f => { const next = { ...f }; delete next[id]; return next }), 3000)
  }

  function handleStatusUpdate(id: string, status: 'approved' | 'rejected') {
    startTransition(async () => {
      const notesEl = document.getElementById(`req-notes-${id}`) as HTMLTextAreaElement
      const res = await updateCustomRequestStatus(id, status, notesEl?.value || undefined)
      if (res.error) showFeedback(id, `Error: ${res.error}`)
      else showFeedback(id, `Request ${status}! Reload to see changes.`)
    })
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-primary text-black border-primary'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1 opacity-70">
                ({initial.filter(r => r.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-zinc-500 text-center py-12">No custom date requests found.</p>
        )}

        {filtered.map((req) => {
          const usr = req.user as Profile | null
          const pkg = req.package as { title?: string } | null

          return (
            <div key={req.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              {feedback[req.id] && (
                <p className={`text-sm px-3 py-2 rounded-lg mb-3 ${feedback[req.id].startsWith('Error') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
                  {feedback[req.id]}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${STATUS_COLORS[req.status] || ''} border text-xs`}>
                      {req.status}
                    </Badge>
                    <span className="font-semibold">{pkg?.title || 'Unknown Package'}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Users className="h-3.5 w-3.5" />
                      <span>{usr?.full_name || usr?.username || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(req.requested_date)} · {req.guests} guest{req.guests > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Phone className="h-3.5 w-3.5" />
                      <a href={`tel:${req.contact_number}`} className="hover:text-white">{req.contact_number}</a>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Mail className="h-3.5 w-3.5" />
                      <a href={`mailto:${req.contact_email}`} className="hover:text-white">{req.contact_email}</a>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600">Submitted {formatDate(req.created_at)}</p>
                </div>

                {/* Actions */}
                {req.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <textarea
                      id={`req-notes-${req.id}`}
                      placeholder="Admin notes (optional)"
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs resize-none w-full sm:w-48"
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
