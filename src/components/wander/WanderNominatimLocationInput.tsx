'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
  type NominatimDestinationHit,
} from '@/lib/nominatim-destinations'
import { Loader2 } from 'lucide-react'

function formatPlaceLabel(d: NominatimDestinationHit) {
  if (d.detail) return `${d.name} · ${d.detail}, ${d.state}`
  return `${d.name}, ${d.state}`
}

type Props = {
  value: string
  onValueChange: (v: string) => void
  placeholder?: string
  className?: string
  /** /wander dark panel styling for dropdown + spinner */
  wander?: boolean
  /** e.g. geo nudge for stays / act / rent */
  onChainFocus?: () => void
  onChainClick?: () => void
  id?: string
  autoComplete?: string
}

/**
 * Free-text location with India Nominatim suggestions (same source as host trip destination search).
 */
export function WanderNominatimLocationInput({
  value,
  onValueChange,
  placeholder,
  className,
  wander = false,
  onChainFocus,
  onChainClick,
  id: idProp,
  autoComplete = 'off',
}: Props) {
  const uid = useId()
  const id = idProp ?? `wloc-${uid.replace(/:/g, '')}`

  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<NominatimDestinationHit[]>([])
  const [searching, setSearching] = useState(false)
  const listId = `${id}-suggestions`
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const runSearch = useCallback(
    (q: string) => {
      const trimmed = q.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
      if (trimmed.length < 3) {
        abortRef.current?.abort()
        reqIdRef.current += 1
        if (timerRef.current) clearTimeout(timerRef.current)
        setResults([])
        setSearching(false)
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const myReq = ++reqIdRef.current
      setSearching(true)

      const ms = nominatimDebounceMs(trimmed.length)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          const rows = await fetchNominatimIndiaDestinations(trimmed, controller.signal)
          if (myReq !== reqIdRef.current) return
          setResults(rows.slice(0, 12))
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
          if (myReq === reqIdRef.current) setResults([])
        } finally {
          if (myReq === reqIdRef.current) setSearching(false)
        }
      }, ms)
    },
    [],
  )

  const handleChange = (next: string) => {
    onValueChange(next)
    setOpen(true)
    runSearch(next)
  }

  const pick = (d: NominatimDestinationHit) => {
    onValueChange(formatPlaceLabel(d))
    setOpen(false)
    setResults([])
    abortRef.current?.abort()
    reqIdRef.current += 1
    setSearching(false)
  }

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <Input
        id={id}
        type="text"
        name="location"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={e => {
          setOpen(true)
          onChainFocus?.()
          if (e.target.value.trim().length >= 3) runSearch(e.target.value)
        }}
        onClick={() => onChainClick?.()}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setOpen(false)
            setResults([])
          }
        }}
        placeholder={placeholder}
        className={cn('pr-9', className)}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-autocomplete="list"
        aria-controls={open && results.length > 0 ? listId : undefined}
      />
      {searching && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 z-[1]">
          <Loader2 className={cn('h-4 w-4 animate-spin', wander ? 'text-[#fcba03]' : 'text-primary')} />
        </span>
      )}

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            'absolute z-[100] top-full left-0 right-0 mt-1 rounded-lg border shadow-xl max-h-56 overflow-y-auto',
            wander
              ? 'border-white/20 bg-zinc-950/98 text-white [color-scheme:dark]'
              : 'border-border bg-card text-foreground',
          )}
        >
          {results.map((r, i) => (
            <li key={r.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${id}-opt-${i}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(r)}
                className={cn(
                  'flex w-full text-left px-3 py-2.5 text-sm border-b last:border-0 transition-colors',
                  wander
                    ? 'border-white/10 hover:bg-white/10'
                    : 'border-border/30 hover:bg-secondary/60',
                )}
              >
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className={wander ? ' text-white/70' : ' text-muted-foreground'}>
                      {', '}
                      {r.state}
                    </span>
                  </div>
                  {r.detail ? (
                    <p
                      className={cn(
                        'text-[10px] truncate mt-0.5',
                        wander ? 'text-white/50' : 'text-muted-foreground',
                      )}
                    >
                      {r.detail}
                    </p>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && value.trim().length >= 3 && results.length === 0 && (
        <div
          className={cn(
            'absolute z-[100] top-full left-0 right-0 mt-1 rounded-lg border shadow-xl px-3 py-3 text-sm',
            wander ? 'border-white/20 bg-zinc-950/98 text-white/60' : 'border-border bg-card text-muted-foreground',
          )}
        >
          No places found — try a nearby city or district
        </div>
      )}
    </div>
  )
}
