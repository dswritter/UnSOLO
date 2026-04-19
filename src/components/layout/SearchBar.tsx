'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  className?: string
  isMobile?: boolean
}

export function SearchBar({ className = '', isMobile = false }: SearchBarProps) {
  const [searchInput, setSearchInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get initial search value from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const q = params.get('q')
      if (q) {
        setSearchInput(q)
      }
    }
  }, [])

  // Handle keyboard shortcut "/" to focus search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault()
        if (isMobile) {
          setIsExpanded(true)
        } else {
          inputRef.current?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMobile])

  // Focus input when expanded (mobile)
  useEffect(() => {
    if (isExpanded && isMobile) {
      inputRef.current?.focus()
    }
  }, [isExpanded, isMobile])

  // Handle click outside to collapse (mobile)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    if (isExpanded && isMobile) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded, isMobile])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchInput.trim()) {
      const params = new URLSearchParams()
      params.set('q', searchInput.trim())
      router.push(`/explore?${params.toString()}`)
      if (isMobile) {
        setIsExpanded(false)
      }
    }
  }

  function handleClear() {
    setSearchInput('')
    inputRef.current?.focus()
  }

  // Mobile: Icon only, expands left
  if (isMobile) {
    return (
      <div ref={containerRef} className="relative">
        {!isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        )}

        {isExpanded && (
          <form onSubmit={handleSearch} className="absolute right-0 top-full mt-2 w-72 z-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Find"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsExpanded(false)
                  }
                }}
                className="w-full pl-9 pr-9 py-2 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:border-primary transition-colors"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    )
  }

  // Desktop: Full search bar
  return (
    <form onSubmit={handleSearch} className={`relative flex items-center ${className}`}>
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Find"
          className="w-full pl-9 pr-9 py-2 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:border-primary transition-colors"
          title="Search (press / to focus)"
        />

        {/* Clear button */}
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
    </form>
  )
}
