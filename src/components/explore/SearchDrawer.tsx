'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'

interface SearchDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialValue?: string
}

export function SearchDrawer({ isOpen, onClose, initialValue = '' }: SearchDrawerProps) {
  const [searchInput, setSearchInput] = useState(initialValue)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
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

        router.push(`/explore?${params.toString()}`)
      }
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchInput, router])

  const handleClear = () => {
    setSearchInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!mounted || !isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer from left */}
      <div className="absolute inset-y-0 left-0 z-50 w-80 max-w-full bg-background shadow-lg animate-in slide-in-from-left-full duration-300">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Search</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-secondary rounded-lg transition-colors"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="p-4 flex-1">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Find trips, stays, activities..."
                className="w-full pl-9 pr-9 py-2.5 rounded-full bg-secondary border border-border text-sm focus:outline-none focus:border-primary transition-colors"
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

            {/* Help text */}
            <p className="text-xs text-muted-foreground">
              Press Escape to close
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
