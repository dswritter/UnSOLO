'use client'

import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'
import type { ServiceListingType } from '@/types'
import { PriceSlider } from './PriceSlider'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DIFFICULTY_OPTIONS = [
  { label: 'All Levels', value: '' },
  { label: 'Easy', value: 'easy' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Challenging', value: 'challenging' },
]

const DURATION_OPTIONS = [
  { label: 'Any Duration', value: '', min: '', max: '' },
  { label: '1–3 days', value: '1-3', min: '1', max: '3' },
  { label: '4–7 days', value: '4-7', min: '4', max: '7' },
  { label: '8+ days', value: '8+', min: '8', max: '' },
]

const PRICE_OPTIONS_SERVICE = [
  { label: 'Any Price', value: '', min: '', max: '' },
  { label: 'Under ₹2K', value: 'u2', min: '', max: '2000' },
  { label: '₹2K – ₹5K', value: '2-5', min: '2000', max: '5000' },
  { label: '₹5K – ₹10K', value: '5-10', min: '5000', max: '10000' },
  { label: '₹10K+', value: '10+', min: '10000', max: '' },
]

const ACTIVITY_TYPES = [
  { label: 'Any Type', value: '' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Cultural', value: 'cultural' },
  { label: 'Nature', value: 'nature' },
  { label: 'Water Sports', value: 'water_sports' },
  { label: 'Wellness', value: 'wellness' },
]

interface FilterDrawerProps {
  isOpen: boolean
  onClose: () => void
  params: Record<string, string>
  activeTab: 'trips' | ServiceListingType
  resultCount: number
  isLoading?: boolean
  maxPackagePrice?: number
  basePath?: string
  /** Keep `search=1` on /wander URLs */
  preserveWanderSearch?: boolean
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-4">
      <h3 className="text-sm font-semibold mb-3">{label}</h3>
      {children}
    </div>
  )
}

export function FilterDrawer({
  isOpen,
  onClose,
  params,
  activeTab,
  resultCount,
  isLoading = false,
  maxPackagePrice = 2000000,
  basePath = '/explore',
  preserveWanderSearch = false,
}: FilterDrawerProps) {
  const [mounted, setMounted] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [monthExpanded, setMonthExpanded] = useState(false)
  const router = useRouter()
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null)
  const drawerTrapRef = useRef<HTMLDivElement>(null)
  useFocusTrap(isOpen && mounted, drawerTrapRef)
  const isTripsTab = activeTab === 'trips'
  const tripSource: 'all' | 'unsolo' | 'community' =
    params.tripSource === 'community' ? 'community' : params.tripSource === 'unsolo' ? 'unsolo' : 'all'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  function buildUrl(updates: Record<string, string | null>) {
    const p = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v && !(k in updates)) p.set(k, v)
    })
    Object.entries(updates).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    if (preserveWanderSearch) {
      p.set('search', '1')
    }
    const qs = p.toString()
    return `${basePath}${qs ? `?${qs}` : ''}`
  }

  function setTripSource(next: 'all' | 'unsolo' | 'community') {
    if (next === 'all') pushExploreUrl(router, basePath, buildUrl({ tripSource: null }))
    else pushExploreUrl(router, basePath, buildUrl({ tripSource: next }))
  }

  function clearAllFilters() {
    setIsClearing(true)
    pushExploreUrl(router, basePath, basePath)
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => {
      setIsClearing(false)
      onClose()
    }, 1500)
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
      <div
        ref={drawerTrapRef}
        className="absolute inset-y-0 left-0 z-50 w-80 max-w-full bg-background shadow-lg animate-in slide-in-from-left-full duration-300 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Filters</h2>
            <p className="text-xs text-muted-foreground">{resultCount} found</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4">
          {isTripsTab ? (
            <>
              {/* Trip Source */}
              <FilterSection label="Trip Source">
                <div className="flex flex-col gap-2">
                  {['all', 'unsolo', 'community'].map((source) => (
                    <button
                      key={source}
                      disabled={isLoading}
                      onClick={() => setTripSource(source as 'all' | 'unsolo' | 'community')}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors',
                        tripSource === source
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                        isLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {source === 'all' ? 'All trips' : source === 'unsolo' ? 'UnSOLO' : 'Community'}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Difficulty */}
              <FilterSection label="Difficulty">
                <div className="flex flex-col gap-2">
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={isLoading}
                      onClick={() => pushExploreUrl(router, basePath, buildUrl({ difficulty: opt.value || null }))}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        (params.difficulty || '') === opt.value
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                        isLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Budget */}
              <FilterSection label="Budget">
                <PriceSlider
                  minValue={0}
                  maxValue={maxPackagePrice}
                  currentMin={parseInt(params.minBudget || '0') * 100 || 0}
                  currentMax={parseInt(params.maxBudget || String(Math.floor(maxPackagePrice / 100))) * 100 || maxPackagePrice}
                  onChange={(minPaise, maxPaise) => {
                    const minRupees = minPaise > 0 ? Math.floor(minPaise / 100) : null
                    const maxRupees = maxPaise < maxPackagePrice ? Math.floor(maxPaise / 100) : null
                    pushExploreUrl(
                      router,
                      basePath,
                      buildUrl({
                        minBudget: minRupees ? String(minRupees) : null,
                        maxBudget: maxRupees ? String(maxRupees) : null,
                      }),
                    )
                  }}
                  step={50000}
                />
              </FilterSection>

              {/* Duration */}
              <FilterSection label="Duration">
                <div className="flex flex-col gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={isLoading}
                      onClick={() =>
                        pushExploreUrl(router, basePath, buildUrl({ minDays: opt.min || null, maxDays: opt.max || null }))
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        params.minDays === opt.min && params.maxDays === opt.max
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                        isLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Month */}
              <div className="border-b border-border pb-4">
                <button
                  onClick={() => setMonthExpanded((v) => !v)}
                  className="w-full flex items-center justify-between mb-3"
                >
                  <h3 className="text-sm font-semibold">
                    Month
                    {params.month && (
                      <span className="ml-2 text-xs font-normal text-primary">
                        ({MONTHS[parseInt(params.month)]})
                      </span>
                    )}
                  </h3>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      monthExpanded && 'rotate-180',
                    )}
                  />
                </button>
                {monthExpanded && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={isLoading}
                      onClick={() => pushExploreUrl(router, basePath, buildUrl({ month: null }))}
                      className={cn(
                        'px-2 py-2 rounded-lg text-xs text-center transition-colors font-medium',
                        !params.month
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                        isLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      Any
                    </button>
                    {MONTHS.map((m, idx) => (
                      <button
                        key={m}
                        disabled={isLoading}
                        onClick={() => pushExploreUrl(router, basePath, buildUrl({ month: String(idx) }))}
                        className={cn(
                          'px-2 py-2 rounded-lg text-xs text-center transition-colors',
                          params.month === String(idx)
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                          isLoading && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* My Interests */}
              <FilterSection label="Interests">
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (params.interested) {
                      pushExploreUrl(router, basePath, buildUrl({ interested: null }))
                    } else {
                      pushExploreUrl(router, basePath, buildUrl({ interested: 'true' }))
                    }
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    params.interested
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  ♥ My Interests
                </button>
              </FilterSection>
            </>
          ) : (
            <>
              {/* Price for services */}
              <FilterSection label="Price">
                <div className="flex flex-col gap-2">
                  {PRICE_OPTIONS_SERVICE.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={isLoading}
                      onClick={() =>
                        pushExploreUrl(router, basePath, buildUrl({ minPrice: opt.min || null, maxPrice: opt.max || null }))
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        params.minPrice === opt.min && params.maxPrice === opt.max
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                        isLoading && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Difficulty for activities */}
              {activeTab === 'activities' && (
                <FilterSection label="Difficulty">
                  <div className="flex flex-col gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        disabled={isLoading}
                        onClick={() => pushExploreUrl(router, basePath, buildUrl({ difficulty: opt.value || null }))}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                          (params.difficulty || '') === opt.value
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                          isLoading && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FilterSection>
              )}

              {/* Activity Type for activities */}
              {activeTab === 'activities' && (
                <FilterSection label="Activity Type">
                  <div className="flex flex-col gap-2">
                    {ACTIVITY_TYPES.map((opt) => (
                      <button
                        key={opt.value}
                        disabled={isLoading}
                        onClick={() => pushExploreUrl(router, basePath, buildUrl({ activityType: opt.value || null }))}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                          (params.activityType || '') === opt.value
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                          isLoading && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FilterSection>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex-shrink-0 space-y-2">
          <button
            onClick={clearAllFilters}
            disabled={isClearing}
            className={cn(
              'w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2',
              isClearing
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            {isClearing ? (
              <>
                <Check className="h-4 w-4" />
                Filters cleared
              </>
            ) : (
              'Clear all filters'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
