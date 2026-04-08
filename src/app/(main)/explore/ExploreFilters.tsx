'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, ChevronDown, X, Heart, Globe, Users, Search } from 'lucide-react'

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

interface Props {
  params: Record<string, string>
  resultCount: number
}

function FilterDropdown({ label, activeLabel, children, isActive }: {
  label: string
  activeLabel: string
  children: React.ReactNode
  isActive: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-primary/15 border-primary/40 text-primary'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
        }`}
      >
        {isActive ? activeLabel : label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]">
          <div onClick={() => setOpen(false)}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

export function ExploreFilters({ params, resultCount }: Props) {
  const router = useRouter()
  const activeTab = params.tab || 'unsolo'
  const [searchInput, setSearchInput] = useState(params.q || '')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildUrl({ q: searchInput.trim() || null }))
  }

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

  function setTab(tab: string) {
    // When switching tabs, preserve other filters but update the tab
    if (tab === 'unsolo') {
      // Default tab: remove tab param entirely
      router.push(buildUrl({ tab: null }))
    } else {
      router.push(buildUrl({ tab }))
    }
  }

  const activeDifficulty = DIFFICULTY_OPTIONS.find(d => d.value === (params.difficulty || ''))
  const activeBudget = BUDGET_OPTIONS.find(b =>
    (b.min === (params.minBudget || '') && b.max === (params.maxBudget || ''))
  ) || BUDGET_OPTIONS[0]
  const activeDuration = DURATION_OPTIONS.find(d =>
    (d.min === (params.minDays || '') && d.max === (params.maxDays || ''))
  ) || DURATION_OPTIONS[0]
  const activeMonth = params.month ? MONTHS[parseInt(params.month)] : null

  const hasFilters = params.difficulty || params.minBudget || params.maxBudget || params.minDays || params.maxDays || params.month || params.q

  return (
    <div className="space-y-2 mb-4">
      {/* One compact row: trip toggle + search; wraps on narrow screens */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div
          className="relative flex h-9 w-full min-w-0 sm:max-w-[min(100%,20rem)] shrink-0 rounded-full border border-border bg-secondary/90 p-0.5 shadow-inner"
          role="tablist"
          aria-label="Trip source"
        >
          <div
            className="pointer-events-none absolute top-0.5 bottom-0.5 w-[calc(50%-4px)] rounded-full bg-primary shadow-sm transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: activeTab === 'community' ? 'calc(50% + 2px)' : '4px' }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unsolo'}
            onClick={() => setTab('unsolo')}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-semibold transition-colors min-h-0 py-1.5 ${
              activeTab === 'unsolo' ? 'text-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">UnSOLO Trips</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'community'}
            onClick={() => setTab('community')}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-semibold transition-colors min-h-0 py-1.5 ${
              activeTab === 'community' ? 'text-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Community Trips</span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex w-full min-w-0 sm:flex-1 sm:max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search trips..."
              className="w-full pl-8 pr-7 py-1.5 rounded-full bg-secondary border border-border text-xs focus:outline-none focus:border-primary"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); router.push(buildUrl({ q: null })) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Filters — tight row */}
      <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-border">
        <div className="flex items-center text-muted-foreground mr-0.5">
          <Filter className="h-3.5 w-3.5" />
        </div>

        {/* Difficulty */}
        <FilterDropdown
          label="Difficulty"
          activeLabel={activeDifficulty?.label || 'Difficulty'}
          isActive={!!params.difficulty}
        >
          {DIFFICULTY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => router.push(buildUrl({ difficulty: opt.value || null }))}
              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors ${
                (params.difficulty || '') === opt.value ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </FilterDropdown>

        {/* Budget */}
        <FilterDropdown
          label="Budget"
          activeLabel={activeBudget.label}
          isActive={!!(params.minBudget || params.maxBudget)}
        >
          {BUDGET_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => router.push(buildUrl({ minBudget: opt.min || null, maxBudget: opt.max || null }))}
              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors ${
                activeBudget.value === opt.value ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </FilterDropdown>

        {/* Duration */}
        <FilterDropdown
          label="Duration"
          activeLabel={activeDuration.label}
          isActive={!!(params.minDays || params.maxDays)}
        >
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => router.push(buildUrl({ minDays: opt.min || null, maxDays: opt.max || null }))}
              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors ${
                activeDuration.value === opt.value ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </FilterDropdown>

        {/* Month */}
        <FilterDropdown
          label="Month"
          activeLabel={activeMonth || 'Month'}
          isActive={!!params.month}
        >
          <button
            onClick={() => router.push(buildUrl({ month: null }))}
            className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors ${
              !params.month ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
          >
            Any Month
          </button>
          <div className="grid grid-cols-3 gap-0.5 p-2">
            {MONTHS.map((m, idx) => (
              <button
                key={m}
                onClick={() => router.push(buildUrl({ month: String(idx) }))}
                className={`px-2 py-1.5 rounded text-xs text-center hover:bg-secondary/50 transition-colors ${
                  params.month === String(idx) ? 'bg-primary/20 text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* Interested toggle */}
        <button
          onClick={() => {
            if (params.interested) {
              router.push(buildUrl({ interested: null }))
            } else {
              router.push(buildUrl({ interested: 'true' }))
            }
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap ${
            params.interested
              ? 'bg-red-500/15 border-red-500/40 text-red-400'
              : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-red-500/30'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${params.interested ? 'fill-red-400' : ''}`} />
          My Interests
        </button>

        {/* Clear all + count */}
        {hasFilters && (
          <>
            <button
              onClick={() => router.push(activeTab === 'community' ? '/explore?tab=community' : '/explore')}
              className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
            <span className="text-xs text-muted-foreground ml-1">{resultCount} found</span>
          </>
        )}
      </div>
    </div>
  )
}
