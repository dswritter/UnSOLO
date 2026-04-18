'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
} from '@/lib/nominatim-destinations'

interface Destination {
  id: string
  name: string
  state: string
  isNew?: boolean
  detail?: string
}

interface DestinationSearchProps {
  destinations: Destination[]
  value: string
  onChange: (id: string) => void
  onNewDestination?: (dest: { id: string; name: string; state: string }) => void
}

export function DestinationSearch({ destinations, value, onChange, onNewDestination }: DestinationSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Destination[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(() => {
    const d = destinations.find(d => d.id === value)
    return d ? `${d.name}, ${d.state}` : ''
  })
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

  // Update label when value changes externally
  useEffect(() => {
    if (value) {
      const d = destinations.find(d => d.id === value)
      if (d) setSelectedLabel(`${d.name}, ${d.state}`)
    }
  }, [value, destinations])

  function normalizeDestQuery(s: string) {
    return s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)

    if (timerRef.current) clearTimeout(timerRef.current)

    const qNorm = normalizeDestQuery(q)
    const tokens = qNorm.split(' ').filter(Boolean)
    const localMatches = destinations
      .filter((d) => {
        const hay = normalizeDestQuery(`${d.name} ${d.state}`)
        return tokens.length === 0 ? true : tokens.every((t) => hay.includes(t))
      })
      .slice(0, 5)
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
          .map((h) => ({ ...h, isNew: true as const }))
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

  async function selectDestination(d: Destination) {
    if (d.isNew) {
      // Create via admin action or direct insert
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const slug = `${d.name}-${d.state}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      const { data: existing } = await supabase
        .from('destinations')
        .select('id')
        .ilike('name', d.name)
        .ilike('state', d.state)
        .maybeSingle()

      if (existing) {
        onChange(existing.id)
        onNewDestination?.({ id: existing.id, name: d.name, state: d.state })
      } else {
        const { data: newDest, error } = await supabase
          .from('destinations')
          .insert({ name: d.name, state: d.state, slug, country: 'India' })
          .select('id')
          .single()

        if (error) {
          toast.error(`"${d.name}, ${d.state}" already exists`)
          return
        }
        onChange(newDest.id)
        onNewDestination?.({ id: newDest.id, name: d.name, state: d.state })
      }
    } else {
      onChange(d.id)
    }

    setSelectedLabel(`${d.name}, ${d.state}`)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query || (open ? '' : selectedLabel)}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { setOpen(true); if (selectedLabel) handleInput('') }}
          placeholder="Search any destination in India..."
          className="w-full pl-9 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map(d => (
            <button
              key={d.id}
              onClick={() => selectDestination(d)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground">, {d.state}</span>
                  {d.isNew && <span className="ml-2 text-[10px] text-primary font-medium">+ New</span>}
                </div>
                {d.detail && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{d.detail}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
