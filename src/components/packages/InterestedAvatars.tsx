'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Users } from 'lucide-react'
import { getInterestedUsers, type InterestedUser } from '@/actions/booking'

interface Props {
  packageId: string
  totalCount: number
  preview: InterestedUser[]
}

const MAX_VISIBLE = 5

export function InterestedAvatars({ packageId, totalCount, preview }: Props) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<InterestedUser[] | null>(null)
  const [loading, setLoading] = useState(false)

  const visible = preview.slice(0, MAX_VISIBLE)
  const overflow = Math.max(0, totalCount - visible.length)

  useEffect(() => {
    if (!open || all || loading) return
    setLoading(true)
    getInterestedUsers(packageId)
      .then(setAll)
      .finally(() => setLoading(false))
  }, [open, all, loading, packageId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (totalCount === 0 && preview.length === 0) return null

  return (
    <>
      <div className="flex -space-x-2" aria-label={`${totalCount} interested`}>
        {visible.map(u => (
          <Link
            key={u.id}
            href={`/profile/${u.username}`}
            title={u.full_name || u.username}
            className="relative h-7 w-7 rounded-full ring-2 ring-background overflow-hidden bg-secondary flex items-center justify-center hover:ring-primary transition"
          >
            {u.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] font-bold text-primary">
                {(u.full_name || u.username)[0].toUpperCase()}
              </span>
            )}
          </Link>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={`View all ${totalCount}`}
            className="relative h-7 min-w-7 px-1.5 rounded-full ring-2 ring-background bg-secondary text-[11px] font-bold text-foreground flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition"
          >
            +{overflow}
          </button>
        )}
        {overflow === 0 && totalCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="View all interested travelers"
            className="relative h-7 w-7 rounded-full ring-2 ring-background bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
          >
            <Users className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                Interested travelers
                <span className="ml-2 text-sm text-muted-foreground font-normal">({totalCount})</span>
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full bg-secondary hover:bg-muted flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && !all ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : (all || preview).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No one yet.</p>
            ) : (
              <ul className="space-y-1">
                {(all || preview).map(u => (
                  <li key={u.id}>
                    <Link
                      href={`/profile/${u.username}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition"
                    >
                      <div className="relative h-9 w-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center shrink-0">
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-primary">
                            {(u.full_name || u.username)[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name || u.username}</p>
                        <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
