'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, ChevronDown, X } from 'lucide-react'

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
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-primary/15 border-primary/40 text-primary'
            : 'bg-secondary border-border text-muted-foreground hover:text-white hover:border-primary/30'
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

  const activeDifficulty = DIFFICULTY_OPTIONS.find(d => d.value === (params.difficulty || ''))
  const activeBudget = BUDGET_OPTIONS.find(b =>
    (b.min === (params.minBudget || '') && b.max === (params.maxBudget || ''))
  ) || BUDGET_OPTIONS[0]
  const activeDuration = DURATION_OPTIONS.find(d =>
    (d.min === (params.minDays || '') && d.max === (params.maxDays || ''))
  ) || DURATION_OPTIONS[0]
  const activeMonth = params.month ? MONTHS[parseInt(params.month)] : null

  const hasFilters = params.difficulty || params.minBudget || params.maxBudget || params.minDays || params.maxDays || params.month

  return (
    <div className="flex flex-wrap items-center gap-2 mb-8 pb-6 border-b border-border">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-1">
        <Filter className="h-4 w-4" />
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

      {/* Clear all + count */}
      {hasFilters && (
        <>
          <button
            onClick={() => router.push('/explore')}
            className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-white transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
          <span className="text-xs text-muted-foreground ml-1">{resultCount} found</span>
        </>
      )}
    </div>
  )
}
