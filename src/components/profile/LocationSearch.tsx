'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin } from 'lucide-react'

interface LocationSearchProps {
  defaultValue: string
  name: string
}

export function LocationSearch({ defaultValue, name }: LocationSearchProps) {
  const [query, setQuery] = useState(defaultValue)
  const [results, setResults] = useState<{ display: string; place_id: number }[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

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
    if (val.length < 2) { setResults([]); return }

    timerRef.current = setTimeout(async () => {
      setSearching(true)
      setOpen(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&countrycodes=in&addressdetails=1`,
          { headers: { 'User-Agent': 'UnSOLO/1.0' } }
        )
        const data = await res.json()
        setResults(data.map((r: { display_name: string; place_id: number; address?: { city?: string; town?: string; village?: string; state?: string } }) => {
          const addr = r.address || {}
          const place = addr.city || addr.town || addr.village || r.display_name.split(',')[0]
          const state = addr.state || ''
          return { display: state ? `${place}, ${state}` : place, place_id: r.place_id }
        }))
      } catch { /* ignore */ }
      setSearching(false)
    }, 400)
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
          placeholder="Search your city..."
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
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              {r.display}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
