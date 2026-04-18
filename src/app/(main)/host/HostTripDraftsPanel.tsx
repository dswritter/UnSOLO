'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileEdit, Trash2, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import {
  deleteHostTripDraft,
  HOST_TRIP_DRAFT_MAX_AGE_MS,
  listHostTripDrafts,
  type HostTripStoredDraft,
} from '@/lib/host-trip-create-draft'

const DRAFT_RETENTION_DAYS = Math.round(HOST_TRIP_DRAFT_MAX_AGE_MS / (24 * 60 * 60 * 1000))

export function HostTripDraftsPanel() {
  const [drafts, setDrafts] = useState<HostTripStoredDraft[]>([])

  const refresh = useCallback(() => {
    setDrafts(listHostTripDrafts())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    function onFocus() {
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  if (drafts.length === 0) return null

  return (
    <div className="mb-8 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Trip drafts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved on this browser only. Drafts are removed automatically after {DRAFT_RETENTION_DAYS} days. Use{' '}
            <span className="font-medium text-foreground">Create New Trip</span> for a fresh form — your drafts stay
            here until you continue or delete them.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5 border-primary/40">
          <Link href="/host/create">
            <Plus className="h-3.5 w-3.5" />
            New trip (blank)
          </Link>
        </Button>
      </div>
      <ul className="space-y-2">
        {drafts.map((d) => {
          const label = d.payload.title.trim() || 'Untitled draft'
          const dest = d.payload.destination
          const sub = dest ? `${dest.name}, ${dest.state}` : null
          return (
            <li
              key={d.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold truncate">{label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    Step {Math.min(d.payload.step + 1, 5)}/5
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {sub ? <span>{sub}</span> : null}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {formatDate(new Date(d.updatedAt).toISOString().slice(0, 10))}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" className="gap-1 bg-primary text-primary-foreground">
                  <Link href={`/host/create?draft=${encodeURIComponent(d.id)}`}>
                    <FileEdit className="h-3.5 w-3.5" />
                    Continue
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => {
                    deleteHostTripDraft(d.id)
                    refresh()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
