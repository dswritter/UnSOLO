'use client'

import { useEffect, useRef, useState } from 'react'
import type { UserLite } from '@/lib/tribe/models'
import { v1 } from '@/lib/api/v1-client'
import { Avatar } from './PostCard'

/** An `@name` being typed at the end of the text. */
const TYPING = /(^|\s)@([A-Za-z0-9_.-]{0,40})$/
const cache = new Map<string, UserLite[]>()

/**
 * People to @mention while someone types `@na…` at the end of a comment: a row of chips above the
 * box. Picking one finishes the mention (`@username `) and puts the cursor back in the box.
 * Signed-in only (the search needs an account).
 */
export function MentionSuggest({ value, onChange, inputRef, signedIn }: {
  value: string
  onChange: (next: string) => void
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  signedIn: boolean
}) {
  const m = TYPING.exec(value)
  const q = m?.[2] ?? ''
  const [hits, setHits] = useState<UserLite[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!signedIn || !q) return
    const key = q.toLowerCase()
    const known = cache.get(key) ?? [...cache.entries()].filter(([k]) => key.startsWith(k)).flatMap(([, v]) => v)
      .filter((u) => u.username.toLowerCase().startsWith(key) || u.name.toLowerCase().split(' ').some((w) => w.startsWith(key)))
    const ctrl = new AbortController()
    timer.current = setTimeout(() => {
      if (known.length) setHits(known.slice(0, 8))
      void v1<{ items: UserLite[] }>(`/api/v1/people?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal }).then((r) => {
        if (r.ok) { cache.set(key, r.data.items); setHits(r.data.items) }
      })
    }, known.length ? 0 : 120)
    return () => { ctrl.abort(); if (timer.current) clearTimeout(timer.current) }
  }, [q, signedIn])

  if (!m || !signedIn) return null
  if (!q) return <p className="px-1 pb-1.5 text-[12px] text-muted-foreground">Type a name or username to mention someone</p>
  const shown = hits.filter((u) => u.username)
  if (!shown.length) return null
  const start = (m.index ?? 0) + m[1].length
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="listbox" aria-label="People to mention">
      {shown.map((u) => (
        <button key={u.id} type="button" role="option" aria-selected={false}
          className="flex shrink-0 items-center gap-2 rounded-full bg-[color:var(--pc-tonal,#f1efe9)] py-1 pl-1 pr-3 text-left"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(`${value.slice(0, start)}@${u.username} `.slice(0, 2000)); inputRef?.current?.focus() }}>
          <Avatar user={u} size={26} />
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold">{u.name}</span>
            <span className="block text-[11px] text-muted-foreground">@{u.username}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
