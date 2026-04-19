'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
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

interface ExploreSidebarProps {
  params: Record<string, string>
  activeTab: 'trips' | ServiceListingType
  resultCount: number
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-4 mb-4">
      <h3 className="text-sm font-semibold mb-3">{label}</h3>
      {children}
    </div>
  )
}

export function ExploreSidebar({ params, activeTab, resultCount }: ExploreSidebarProps) {
  const router = useRouter()
  const isTripsTab = activeTab === 'trips'
  const tripSource: 'all' | 'unsolo' | 'community' =
    params.tab === 'community' ? 'community' : params.tab === 'unsolo' ? 'unsolo' : 'all'

  // Track optimistic state for instant UI feedback
  const [optimisticParams, setOptimisticParams] = useState<Record<string, string | null>>({})

  // Check if any filters are active
  const hasActiveFilters = Object.entries(params).some(([key, value]) => {
    if (key === 'q' || key === 'tab') return false // Don't count search or tab selection as filters
    return !!value
  })

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

  function handleFilterClick(filterKey: string, filterValue: string | null) {
    // Optimistic update for instant feedback
    setOptimisticParams((prev) => ({
      ...prev,
      [filterKey]: filterValue,
    }))
    router.push(buildUrl({ [filterKey]: filterValue }))
  }

  function setTripSource(next: 'all' | 'unsolo' | 'community') {
    setOptimisticParams((prev) => ({
      ...prev,
      tab: next === 'all' ? null : next,
    }))
    if (next === 'all') router.push(buildUrl({ tab: null }))
    else router.push(buildUrl({ tab: next }))
  }

  function clearAllFilters() {
    setOptimisticParams({})
    router.push('/explore')
  }

  // Get current values (prefer optimistic state, fall back to params)
  const getCurrentValue = (key: string, defaultValue: string = '') => {
    if (key in optimisticParams) return optimisticParams[key] ?? defaultValue
    return params[key] ?? defaultValue
  }

  return (
    <div className="bg-background border-r border-border p-4 overflow-y-auto max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-1">Filters</h2>
        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground">{resultCount} found</p>
        )}
      </div>

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
              {DIFFICULTY_OPTIONS.map((opt) => {
                const currentValue = getCurrentValue('difficulty', '')
                const isSelected = currentValue === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleFilterClick('difficulty', isSelected ? null : (opt.value || null))}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          {/* Budget */}
          <FilterSection label="Budget">
            <div className="flex flex-col gap-2">
              {BUDGET_OPTIONS.map((opt) => {
                const minBudget = getCurrentValue('minBudget', '')
                const maxBudget = getCurrentValue('maxBudget', '')
                const isSelected = minBudget === opt.min && maxBudget === opt.max
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (isSelected) {
                        handleFilterClick('minBudget', null)
                        handleFilterClick('maxBudget', null)
                      } else {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          minBudget: opt.min || null,
                          maxBudget: opt.max || null,
                        }))
                        router.push(buildUrl({ minBudget: opt.min || null, maxBudget: opt.max || null }))
                      }
                    }}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          {/* Duration */}
          <FilterSection label="Duration">
            <div className="flex flex-col gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const minDays = getCurrentValue('minDays', '')
                const maxDays = getCurrentValue('maxDays', '')
                const isSelected = minDays === opt.min && maxDays === opt.max
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (isSelected) {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          minDays: null,
                          maxDays: null,
                        }))
                        router.push(buildUrl({ minDays: null, maxDays: null }))
                      } else {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          minDays: opt.min || null,
                          maxDays: opt.max || null,
                        }))
                        router.push(buildUrl({ minDays: opt.min || null, maxDays: opt.max || null }))
                      }
                    }}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          {/* Month */}
          <FilterSection label="Month">
            <div className="flex flex-col gap-2">
              {(() => {
                const currentMonth = getCurrentValue('month', '')
                return (
                  <>
                    <button
                      onClick={() => {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          month: null,
                        }))
                        router.push(buildUrl({ month: null }))
                      }}
                      className={cn(
                        'px-2 py-2 rounded-lg text-xs text-center transition-colors font-medium',
                        !currentMonth
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      Any
                    </button>
                    <div className="grid grid-cols-3 gap-1">
                      {MONTHS.map((m, idx) => (
                        <button
                          key={m}
                          onClick={() => {
                            const monthStr = String(idx)
                            if (currentMonth === monthStr) {
                              setOptimisticParams((prev) => ({
                                ...prev,
                                month: null,
                              }))
                              router.push(buildUrl({ month: null }))
                            } else {
                              setOptimisticParams((prev) => ({
                                ...prev,
                                month: monthStr,
                              }))
                              router.push(buildUrl({ month: monthStr }))
                            }
                          }}
                          className={cn(
                            'px-1 py-2 rounded-lg text-xs text-center transition-colors',
                            currentMonth === String(idx)
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          </FilterSection>

          {/* My Interests */}
          <FilterSection label="Interests">
            {(() => {
              const interested = getCurrentValue('interested', '')
              return (
                <button
                  onClick={() => {
                    if (interested) {
                      setOptimisticParams((prev) => ({
                        ...prev,
                        interested: null,
                      }))
                      router.push(buildUrl({ interested: null }))
                    } else {
                      setOptimisticParams((prev) => ({
                        ...prev,
                        interested: 'true',
                      }))
                      router.push(buildUrl({ interested: 'true' }))
                    }
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    interested
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                  )}
                >
                  ♥ My Interests
                </button>
              )
            })()}
          </FilterSection>
        </>
      ) : (
        <>
          {/* Price for services */}
          <FilterSection label="Price">
            <div className="flex flex-col gap-2">
              {PRICE_OPTIONS_SERVICE.map((opt) => {
                const minPrice = getCurrentValue('minPrice', '')
                const maxPrice = getCurrentValue('maxPrice', '')
                const isSelected = minPrice === opt.min && maxPrice === opt.max
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (isSelected) {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          minPrice: null,
                          maxPrice: null,
                        }))
                        router.push(buildUrl({ minPrice: null, maxPrice: null }))
                      } else {
                        setOptimisticParams((prev) => ({
                          ...prev,
                          minPrice: opt.min || null,
                          maxPrice: opt.max || null,
                        }))
                        router.push(buildUrl({ minPrice: opt.min || null, maxPrice: opt.max || null }))
                      }
                    }}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          {/* Difficulty for activities */}
          {activeTab === 'activities' && (
            <FilterSection label="Difficulty">
              <div className="flex flex-col gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const currentValue = getCurrentValue('difficulty', '')
                  const isSelected = currentValue === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleFilterClick('difficulty', isSelected ? null : (opt.value || null))}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </FilterSection>
          )}

          {/* Activity Type for activities */}
          {activeTab === 'activities' && (
            <FilterSection label="Activity Type">
              <div className="flex flex-col gap-2">
                {ACTIVITY_TYPES.map((opt) => {
                  const currentValue = getCurrentValue('activityType', '')
                  const isSelected = currentValue === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleFilterClick('activityType', isSelected ? null : (opt.value || null))}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </FilterSection>
          )}
        </>
      )}

      {/* Clear filters button */}
      <div className="mt-6 pt-4 border-t border-border">
        <button
          onClick={clearAllFilters}
          className="w-full px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors text-sm font-medium"
        >
          Clear all filters
        </button>
      </div>
    </div>
  )
}
