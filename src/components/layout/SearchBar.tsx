'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  placeholder?: string
  className?: string
}

export function SearchBar({ placeholder = 'Search trips...', className = '' }: SearchBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [activeTab, setActiveTab] = useState<'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'>('trips')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get active tab from current URL
  useEffect(() => {
    const path = window.location.pathname
    if (path.includes('/explore')) {
      const params = new URLSearchParams(window.location.search)
      const type = params.get('type')
      if (type === 'stays' || type === 'activities' || type === 'rentals' || type === 'getting_around') {
        setActiveTab(type)
      } else {
        setActiveTab('trips')
      }
    }
  }, [])

  // Set dynamic placeholder based on active tab
  const getPlaceholder = () => {
    const tabPlaceholders = {
      trips: 'Search trips...',
      stays: 'Search stays...',
      activities: 'Search activities...',
      rentals: 'Search rentals...',
      getting_around: 'Search transport...',
    }
    return tabPlaceholders[activeTab] || 'Search...'
  }

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus()
    }
  }, [isExpanded])

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

  // Handle click outside to collapse
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded])

  // Handle keyboard events
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // "/" to expand (only if not already in input)
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault()
        setIsExpanded(true)
      }

      // "esc" to collapse
      if (event.key === 'Escape') {
        setIsExpanded(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchInput.trim()) {
      const params = new URLSearchParams()
      params.set('q', searchInput.trim())
      router.push(`/explore?${params.toString()}`)
      setIsExpanded(false)
    }
  }

  function handleClear() {
    setSearchInput('')
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative flex items-center', className)}
    >
      {/* Collapsed state: magnifying glass icon only */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          aria-label="Open search"
          title="Search (press / to open)"
        >
          <Search className="h-5 w-5" />
        </button>
      )}

      {/* Expanded state: search input */}
      {isExpanded && (
        <form onSubmit={handleSearch} className="absolute right-0 top-1/2 -translate-y-1/2 w-64 sm:w-80">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={getPlaceholder()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsExpanded(false)
                }
              }}
              className="w-full pl-9 pr-9 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary transition-colors"
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
      )}
    </div>
  )
}
