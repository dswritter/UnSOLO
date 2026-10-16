'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SETTING_LABELS } from '@/app/(admin)/admin/settings/setting-labels'

export type PaletteItem = { href: string; label: string; group: string; icon: LucideIcon }

function matches(haystack: string, query: string) {
  const text = haystack.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(token => text.includes(token))
}

/** ⌘K / Ctrl+K jump-to for admin pages and individual settings. */
export function AdminCommandPalette({ pages, includeSettings }: { pages: PaletteItem[]; includeSettings: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<PaletteItem[]>(() => {
    const settings = includeSettings
      ? Object.entries(SETTING_LABELS).map(([key, { label }]) => ({
          href: `/admin/settings?focus=${encodeURIComponent(key)}`,
          label,
          group: 'Settings',
          icon: Settings,
        }))
      : []
    return [...pages, ...settings]
  }, [pages, includeSettings])

  const results = useMemo(() => {
    const q = query.trim()
    const list = q ? items.filter(item => matches(`${item.label} ${item.group}`, q)) : items.filter(item => item.group !== 'Settings')
    return list.slice(0, 40)
  }, [items, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuery('')
        setActive(0)
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  const go = (item: PaletteItem | undefined) => {
    if (!item) return
    setOpen(false)
    router.push(item.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setQuery(''); setActive(0); setOpen(true) }}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-foreground/5 px-3 text-sm text-sidebar-foreground/60 transition-colors hover:bg-foreground/10 hover:text-sidebar-foreground"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search admin</span>
        <kbd className="rounded border border-sidebar-border px-1.5 text-[10px] font-medium">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Search admin" className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
                  else if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Jump to a page or setting…"
                aria-label="Search admin pages and settings"
                className="input-bare h-12 min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">Esc</kbd>
            </div>
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{query}”</li>
              ) : results.map((item, i) => {
                const Icon = item.icon
                return (
                  <li key={item.href} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground')}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', i === active && 'text-primary')} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{item.group}</span>
                      {i === active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
