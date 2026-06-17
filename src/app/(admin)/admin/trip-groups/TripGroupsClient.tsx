'use client'

import React, { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Users, UserPlus, MessageCircle } from 'lucide-react'
import type { AdminTripGroup } from '@/actions/admin'

interface Props {
  groups: AdminTripGroup[]
  addUser: (roomId: string, username: string) => Promise<{ success?: boolean; error?: string; username?: string }>
}

export function TripGroupsClient({ groups, addUser }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleAdd(roomId: string) {
    const username = (drafts[roomId] || '').trim()
    if (!username) return
    startTransition(async () => {
      const res = await addUser(roomId, username)
      if (res.error) toast.error(res.error)
      else {
        toast.success(`Added @${res.username} to the group`)
        setDrafts(d => ({ ...d, [roomId]: '' }))
      }
    })
  }

  if (groups.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No trip groups yet.</p>
  }

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.roomId} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg overflow-hidden bg-secondary flex items-center justify-center shrink-0">
              {g.image
                ? <img src={g.image} alt="" className="h-full w-full object-cover" />
                : <MessageCircle className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{g.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.memberCount} member{g.memberCount === 1 ? '' : 's'}</span>
                {g.packageSlug && <a href={`/packages/${g.packageSlug}`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">View trip</a>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                placeholder="username"
                value={drafts[g.roomId] || ''}
                onChange={e => setDrafts(d => ({ ...d, [g.roomId]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(g.roomId) }}
                className="bg-secondary border-border text-sm h-9 w-36"
              />
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleAdd(g.roomId)} className="border-border">
                <UserPlus className="mr-1.5 h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
