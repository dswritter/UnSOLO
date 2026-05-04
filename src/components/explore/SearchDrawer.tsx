'use client'

import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'

interface SearchDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialValue?: string
  basePath?: string
  preserveWanderSearch?: boolean
  activeTab?: 'trips' | 'stays' | 'activities' | 'rentals'
}

const TAB_PLACEHOLDER: Record<NonNullable<SearchDrawerProps['activeTab']>, string> = {
  trips: 'Search trips by destination…',
  stays: 'Search stays by city or area…',
  activities: 'Search activities (e.g. trek, kayak)…',
  rentals: 'Search rentals (e.g. bike, car)…',
}

export function SearchDrawer({
  isOpen,
  onClose,
  initialValue = '',
  basePath = '/',
  preserveWanderSearch = false,
  activeTab,
}: SearchDrawerProps) {
  const [searchInput, setSearchInput] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const trapRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useFocusTrap(isOpen, trapRef)

  useEffect(() => {
    if (!isOpen) return
    // Mobile browsers won't open the keyboard from focus() unless it lands within
    // a microtask of the user's tap. We schedule both an immediate and a paint-aligned
    // focus attempt — the rAF one wins on iOS/Chrome where the input has just mounted.
    inputRef.current?.focus({ preventScroll: true })
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      // Move caret to end so the existing query stays usable for editing.
      const len = el.value.length
      try { el.setSelectionRange(len, len) } catch {}
    })
    return () => cancelAnimationFrame(raf)
  }, [isOpen])

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const trimmedInput = searchInput.trim()
        const params = new URLSearchParams(window.location.search)

        if (trimmedInput) {
          params.set('q', trimmedInput)
        } else {
          params.delete('q')
        }
        if (preserveWanderSearch) {
          params.set('search', '1')
        }

        pushExploreUrl(router, basePath, `${basePath}?${params.toString()}`)
      }
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchInput, router, basePath, preserveWanderSearch])

  const handleClear = () => {
    setSearchInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
    if (e.key === 'Enter') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Search">
      {/* Backdrop — closes on outside tap, also dims the bottom nav so the
          search bar above it is visually clearly the active surface. */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="md:hidden fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]"
      />
      {/* Full-width search bar — sits above the bottom nav (z-50) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-background border-t border-border safe-bottom">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeTab ? TAB_PLACEHOLDER[activeTab] : 'Search…'}
              className="w-full pl-9 pr-9 py-2 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:border-primary transition-colors"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors flex-shrink-0"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
