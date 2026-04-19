'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ServiceListingType } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DIFFICULTY_OPTIONS = [
  { label: 'All Levels', value: '' },
  { label: 'Easy', value: 'easy' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Challenging', value: 'challenging' },
]

const BUDGET_OPTIONS = [
  { label: 'Any Budget', value: '', min: '', max: '' },
  { label: 'Under ₹10K', value: 'u10', min: '', max: '10000' },
  { label: '₹10K – ₹20K', value: '10-20', min: '10000', max: '20000' },
  { label: '₹20K – ₹35K', value: '20-35', min: '20000', max: '35000' },
  { label: '₹35K+', value: '35+', min: '35000', max: '' },
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
}: FilterDrawerProps) {
  const [mounted, setMounted] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const router = useRouter()
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null)
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
    const qs = p.toString()
    return `/explore${qs ? `?${qs}` : ''}`
  }

  function setTripSource(next: 'all' | 'unsolo' | 'community') {
    if (next === 'all') router.push(buildUrl({ tripSource: null }))
    else router.push(buildUrl({ tripSource: next }))
  }

  function clearAllFilters() {
    setIsClearing(true)
    router.push('/explore')
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
      <div className="absolute inset-y-0 left-0 z-50 w-80 max-w-full bg-background shadow-lg animate-in slide-in-from-left-full duration-300 flex flex-col overflow-hidden">
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
                      onClick={() => setTripSource(source as 'all' | 'unsolo' | 'community')}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors',
                        tripSource === source
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
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
                      onClick={() => router.push(buildUrl({ difficulty: opt.value || null }))}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        (params.difficulty || '') === opt.value
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Budget */}
              <FilterSection label="Budget">
                <div className="flex flex-col gap-2">
                  {BUDGET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        router.push(buildUrl({ minBudget: opt.min || null, maxBudget: opt.max || null }))
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        params.minBudget === opt.min && params.maxBudget === opt.max
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Duration */}
              <FilterSection label="Duration">
                <div className="flex flex-col gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        router.push(buildUrl({ minDays: opt.min || null, maxDays: opt.max || null }))
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        params.minDays === opt.min && params.maxDays === opt.max
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Month */}
              <FilterSection label="Month">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => router.push(buildUrl({ month: null }))}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs text-center transition-colors font-medium',
                      !params.month
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    )}
                  >
                    Any
                  </button>
                  {MONTHS.map((m, idx) => (
                    <button
                      key={m}
                      onClick={() => router.push(buildUrl({ month: String(idx) }))}
                      className={cn(
                        'px-2 py-2 rounded-lg text-xs text-center transition-colors',
                        params.month === String(idx)
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* My Interests */}
              <FilterSection label="Interests">
                <button
                  onClick={() => {
                    if (params.interested) {
                      router.push(buildUrl({ interested: null }))
                    } else {
                      router.push(buildUrl({ interested: 'true' }))
                    }
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    params.interested
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
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
                      onClick={() =>
                        router.push(buildUrl({ minPrice: opt.min || null, maxPrice: opt.max || null }))
                      }
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        params.minPrice === opt.min && params.maxPrice === opt.max
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
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
                        onClick={() => router.push(buildUrl({ difficulty: opt.value || null }))}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                          (params.difficulty || '') === opt.value
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
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
                        onClick={() => router.push(buildUrl({ activityType: opt.value || null }))}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                          (params.activityType || '') === opt.value
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
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
