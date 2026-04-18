'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
} from '@/lib/nominatim-destinations'

interface LocationSearchProps {
  defaultValue: string
  name: string
}

export function LocationSearch({ defaultValue, name }: LocationSearchProps) {
  const [query, setQuery] = useState(defaultValue)
  const [results, setResults] = useState<{ display: string; place_id: number; detail?: string }[]>(
    [],
  )
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const nominatimReqIdRef = useRef(0)
  const nominatimAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(val: string) {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length < 3) {
      nominatimAbortRef.current?.abort()
      nominatimReqIdRef.current += 1
      setResults([])
      setSearching(false)
      return
    }

    nominatimAbortRef.current?.abort()
    const debounceMs = nominatimDebounceMs(val.trim().length)

    timerRef.current = setTimeout(async () => {
      const reqId = ++nominatimReqIdRef.current
      const controller = new AbortController()
      nominatimAbortRef.current = controller
      setSearching(true)
      setOpen(true)
      try {
        const hits = await fetchNominatimIndiaDestinations(val, controller.signal)
        if (reqId !== nominatimReqIdRef.current) return

        setResults(
          hits.map((h) => ({
            display: `${h.name}, ${h.state}`,
            place_id: parseInt(h.id.replace(/^new_/, ''), 10),
            detail: h.detail,
          })),
        )
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      } finally {
        if (reqId === nominatimReqIdRef.current) setSearching(false)
      }
    }, debounceMs)
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input type="hidden" name={name} value={query} />
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search your city or town..."
          className="w-full pl-9 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => { setQuery(r.display); setOpen(false) }}
              className="flex items-start gap-2 w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block">{r.display}</span>
                {r.detail && (
                  <span className="block text-[10px] text-muted-foreground truncate">{r.detail}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
