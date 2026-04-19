'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  className?: string
}

export function SearchBar({ className = '' }: SearchBarProps) {
  const [searchInput, setSearchInput] = useState('')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

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
        inputRef.current?.focus()
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
    }
  }

  function handleClear() {
    setSearchInput('')
    inputRef.current?.focus()
  }

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
