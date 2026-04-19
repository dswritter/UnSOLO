'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import type { ServiceListingType } from '@/types'

interface ExploreFiltersProps {
  params: Record<string, string>
  resultCount: number
  activeTab: 'trips' | ServiceListingType
}

export function ExploreFilters({ params, resultCount, activeTab }: ExploreFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSearch = searchParams.get('search') || ''

  function handleSearch(query: string) {
    const newParams = new URLSearchParams(searchParams)
    if (query) {
      newParams.set('search', query)
      newParams.set('tab', activeTab)
    } else {
      newParams.delete('search')
    }
    router.push(`/explore?${newParams.toString()}`)
  }

  function clearFilters() {
    router.push(`/explore?tab=${activeTab}`)
  }

  const hasFilters = currentSearch || (params.difficulty && activeTab !== 'trips')

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={activeTab === 'trips' ? 'Search destinations...' : 'Search services...'}
          value={currentSearch}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-secondary border-border"
        />
      </div>

      {/* Active filters badge and clear button */}
      {hasFilters && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Active filters:</span>
          {currentSearch && (
            <span className="bg-primary/20 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              {currentSearch}
              <button onClick={() => handleSearch('')} className="hover:text-primary/60">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {params.difficulty && activeTab !== 'trips' && (
            <span className="bg-primary/20 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              {params.difficulty}
              <button onClick={clearFilters} className="hover:text-primary/60">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        {resultCount} result{resultCount !== 1 ? 's' : ''} found
      </div>
    </div>
  )
}
