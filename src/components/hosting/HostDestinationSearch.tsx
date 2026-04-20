'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { createHostDestination } from '@/actions/hosting'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
} from '@/lib/nominatim-destinations'
import type { Destination } from '@/types'

type Result = {
  id: string
  name: string
  state: string
  isNew?: boolean
  detail?: string
}

interface Props {
  destinations: Destination[]
  /** Excluded from results (already-selected IDs). */
  excludeIds?: string[]
  /** Called when a destination is picked (existing or newly created). */
  onPick: (destination: { id: string; name: string; state: string }) => void
  placeholder?: string
  /** When true, after a pick the input clears so the user can keep adding more. */
  clearOnPick?: boolean
}

/**
 * Host-facing destination search. Matches the UX in HostTripForm — local DB
 * match first, Nominatim for fuzzy India-wide results, and a "+ New" chip that
 * creates the destination via the server action on selection.
 */
export function HostDestinationSearch({
  destinations,
  excludeIds = [],
  onPick,
  placeholder = 'Search any destination in India...',
  clearOnPick = true,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nominatimReqIdRef = useRef(0)
  const nominatimAbortRef = useRef<AbortController | null>(null)
  const excludeSet = new Set(excludeIds)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function normalize(s: string) {
    return s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)

    const qNorm = normalize(q)
    const tokens = qNorm.split(' ').filter(Boolean)
    const localMatches = destinations
      .filter((d) => !excludeSet.has(d.id))
      .filter((d) => {
        const hay = normalize(`${d.name} ${d.state}`)
        if (tokens.length === 0) return true
        if (hay.includes(qNorm)) return true
        return tokens.every((t) => hay.includes(t))
      })
      .slice(0, 5)
      .map(d => ({ id: d.id, name: d.name, state: d.state }))

    setResults(localMatches)

    if (q.length < 3) {
      nominatimAbortRef.current?.abort()
      nominatimReqIdRef.current += 1
      setSearching(false)
      return
    }

    nominatimAbortRef.current?.abort()
    const debounceMs = nominatimDebounceMs(q.trim().length)

    timerRef.current = setTimeout(async () => {
      const reqId = ++nominatimReqIdRef.current
      const controller = new AbortController()
      nominatimAbortRef.current = controller
      setSearching(true)
      try {
        const mapHits = await fetchNominatimIndiaDestinations(q, controller.signal)
        if (reqId !== nominatimReqIdRef.current) return

        const mapResults = mapHits
          .map((h): Result => ({ id: h.id, name: h.name, state: h.state, detail: h.detail, isNew: true }))
          .filter(
            (m) =>
              !localMatches.find(
                (l) =>
                  l.name.toLowerCase() === m.name.toLowerCase() &&
                  l.state.toLowerCase() === m.state.toLowerCase(),
              ),
          )

        setResults([...localMatches, ...mapResults])
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      } finally {
        if (reqId === nominatimReqIdRef.current) setSearching(false)
      }
    }, debounceMs)
  }

  async function handleSelect(r: Result) {
    if (r.isNew) {
      const res = await createHostDestination(r.name, r.state)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      onPick({ id: res.id, name: res.name, state: res.state })
    } else {
      onPick({ id: r.id, name: r.name, state: r.state })
    }

    if (clearOnPick) setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      )}

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="flex items-center justify-between w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">, {r.state}</span>
                </div>
                {r.detail && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.detail}</p>
                )}
              </div>
              {r.isNew && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  New
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 3 && results.length === 0 && !searching && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl px-3 py-4 text-sm text-muted-foreground text-center">
          No destinations found for &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
