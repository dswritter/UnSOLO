'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { searchProfilesForStatusAudience } from '@/actions/profile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

type Row = { id: string; username: string; full_name: string | null; avatar_url: string | null }

export function StatusAudienceUserTokens({
  selectedUsernames,
  onChange,
  label,
  placeholder = 'Type name or username…',
}: {
  selectedUsernames: string[]
  onChange: (usernames: string[]) => void
  label: string
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim()
    if (t.length < 1) {
      setHits([])
      return
    }
    setLoading(true)
    try {
      const rows = await searchProfilesForStatusAudience(t)
      setHits(rows as Row[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = q.trim()
    if (t.length < 1) {
      setHits([])
      return
    }
    timer.current = setTimeout(() => void runSearch(t), 220)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, runSearch])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setHits([])
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function addUsername(username: string) {
    const u = username.trim().toLowerCase()
    if (!u) return
    if (selectedUsernames.some(s => s.toLowerCase() === u)) return
    onChange([...selectedUsernames, u])
    setQ('')
    setHits([])
  }

  function removeUsername(username: string) {
    onChange(selectedUsernames.filter(s => s.toLowerCase() !== username.toLowerCase()))
  }

  return (
    <div ref={rootRef} className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {selectedUsernames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsernames.map(u => (
            <span
              key={u}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs"
            >
              @{u}
              <button
                type="button"
                className="p-0.5 rounded-full hover:bg-background/80"
                aria-label={`Remove ${u}`}
                onClick={() => removeUsername(u)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <input
          className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && hits[0]) {
              e.preventDefault()
              addUsername(hits[0].username)
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading ? <p className="text-[10px] text-muted-foreground mt-1">Searching…</p> : null}
        {hits.length > 0 ? (
          <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1">
            {hits.map(h => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary/80"
                  onClick={() => addUsername(h.username)}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={h.avatar_url || ''} />
                    <AvatarFallback className="text-[10px]">{getInitials(h.full_name || h.username)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{h.full_name || h.username}</span>
                    <span className="text-[11px] text-muted-foreground">@{h.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
