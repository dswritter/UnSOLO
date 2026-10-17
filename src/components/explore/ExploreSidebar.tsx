'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'
import type { ServiceListingType } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type RangeOption = { label: string; min: string; max: string }

const TRIP_SOURCES = [
  { label: 'All', value: '' },
  { label: 'UnSOLO', value: 'unsolo' },
  { label: 'Community', value: 'community' },
]

const DIFFICULTY_OPTIONS = [
  { label: 'Easy', value: 'easy' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Challenging', value: 'challenging' },
]

const BUDGET_OPTIONS: RangeOption[] = [
  { label: 'Under ₹10K', min: '', max: '10000' },
  { label: '₹10K–20K', min: '10000', max: '20000' },
  { label: '₹20K–35K', min: '20000', max: '35000' },
  { label: '₹35K+', min: '35000', max: '' },
]

const DURATION_OPTIONS: RangeOption[] = [
  { label: '1–3 days', min: '1', max: '3' },
  { label: '4–7 days', min: '4', max: '7' },
  { label: '8+ days', min: '8', max: '' },
]

const PRICE_OPTIONS_SERVICE: RangeOption[] = [
  { label: 'Under ₹2K', min: '', max: '2000' },
  { label: '₹2K–5K', min: '2000', max: '5000' },
  { label: '₹5K–10K', min: '5000', max: '10000' },
  { label: '₹10K+', min: '10000', max: '' },
]

const FILTER_KEYS = ['tripSource', 'difficulty', 'minBudget', 'maxBudget', 'minDays', 'maxDays', 'month', 'interested', 'minPrice', 'maxPrice', 'amenities']

interface ExploreSidebarProps {
  params: Record<string, string>
  activeTab: 'trips' | ServiceListingType
  resultCount: number
  /** @deprecated Budget uses fixed ranges now; kept for call-site compatibility. */
  maxPackagePrice?: number
  basePath?: string
}

function rupeesShort(value: string) {
  const n = Number(value)
  return n >= 1000 ? `₹${Math.round(n / 100) / 10}K` : `₹${n}`
}

function rangeSummary(options: RangeOption[], min: string, max: string, unit?: 'days') {
  if (!min && !max) return ''
  const preset = options.find(o => o.min === min && o.max === max)
  if (preset) return preset.label
  if (unit === 'days') return min && max ? `${min}–${max} days` : min ? `${min}+ days` : `≤ ${max} days`
  return min && max ? `${rupeesShort(min)}–${rupeesShort(max)}` : min ? `${rupeesShort(min)}+` : `Under ${rupeesShort(max)}`
}

function FilterSection({
  label,
  summary,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  label: string
  summary?: string
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const expanded = !collapsible || open
  const heading = (
    <>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="ml-auto truncate pl-2 text-[11px] font-medium text-primary">{summary}</span>
      {collapsible ? (
        <ChevronDown className={cn('ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      ) : null}
    </>
  )
  return (
    <section className="border-t border-border/50 py-3.5 first:border-t-0 first:pt-0">
      {collapsible ? (
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex w-full items-center text-left">
          {heading}
        </button>
      ) : (
        <div className="flex items-center">{heading}</div>
      )}
      {expanded ? <div className="mt-2.5">{children}</div> : null}
    </section>
  )
}

function OptionGrid<T>({
  options,
  columns,
  isSelected,
  onSelect,
  label,
}: {
  options: T[]
  columns: 2 | 3 | 4
  isSelected: (option: T) => boolean
  onSelect: (option: T) => void
  label: (option: T) => string
}) {
  return (
    <div className={cn('grid gap-1.5', columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
      {options.map(option => {
        const selected = isSelected(option)
        return (
          <button
            key={label(option)}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(option)}
            className={cn(
              'h-8 truncate rounded-lg border text-xs font-medium transition-colors',
              // Tighter type on 3-up rows so "Community" / "Challenging" fit the sidebar width.
              columns === 3 ? 'px-0.5 text-[11px] tracking-tight' : 'px-1',
              selected
                ? 'border-primary bg-primary/12 text-foreground ring-1 ring-primary/40'
                : 'border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {label(option)}
          </button>
        )
      })}
    </div>
  )
}

/** Shared filter navigation for the desktop sidebar and the mobile drawer. */
export function useExploreFilterNav(params: Record<string, string>, basePath = '/') {
  const router = useRouter()
  const activeCount = FILTER_KEYS.filter(key => !!params[key]).length
    - (params.minBudget && params.maxBudget ? 1 : 0)
    - (params.minDays && params.maxDays ? 1 : 0)
    - (params.minPrice && params.maxPrice ? 1 : 0)

  function navigate(updates: Record<string, string | null>) {
    const p = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v && !(k in updates) && k !== 'page') p.set(k, v)
    })
    Object.entries(updates).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    if (basePath === '/') p.set('search', '1')
    const qs = p.toString()
    pushExploreUrl(router, basePath, `${basePath}${qs ? `?${qs}` : ''}`)
  }

  const clearAll = () => navigate(Object.fromEntries(FILTER_KEYS.map(key => [key, null])))
  return { navigate, clearAll, activeCount }
}

export function ExploreFilterFields({
  params,
  activeTab,
  navigate,
}: {
  params: Record<string, string>
  activeTab: 'trips' | ServiceListingType
  navigate: (updates: Record<string, string | null>) => void
}) {
  const isTripsTab = activeTab === 'trips'
  const range = (minKey: string, maxKey: string, options: RangeOption[]) => ({
    options,
    columns: (options.length === 3 ? 3 : 2) as 2 | 3,
    label: (o: RangeOption) => o.label,
    isSelected: (o: RangeOption) => (params[minKey] || '') === o.min && (params[maxKey] || '') === o.max,
    onSelect: (o: RangeOption) => {
      const same = (params[minKey] || '') === o.min && (params[maxKey] || '') === o.max
      navigate(same ? { [minKey]: null, [maxKey]: null } : { [minKey]: o.min || null, [maxKey]: o.max || null })
    },
  })

  const difficulty = {
    options: DIFFICULTY_OPTIONS,
    columns: 3 as const,
    label: (o: (typeof DIFFICULTY_OPTIONS)[number]) => o.label,
    isSelected: (o: (typeof DIFFICULTY_OPTIONS)[number]) => params.difficulty === o.value,
    onSelect: (o: (typeof DIFFICULTY_OPTIONS)[number]) => navigate({ difficulty: params.difficulty === o.value ? null : o.value }),
  }
  const difficultySummary = DIFFICULTY_OPTIONS.find(o => o.value === params.difficulty)?.label

  return (
    <div>
      {isTripsTab ? (
        <>
          <FilterSection label="Hosted by">
            <OptionGrid
              options={TRIP_SOURCES}
              columns={3}
              label={o => o.label}
              isSelected={o => (params.tripSource || '') === o.value}
              onSelect={o => navigate({ tripSource: o.value || null })}
            />
          </FilterSection>

          <FilterSection label="Difficulty" summary={difficultySummary}>
            <OptionGrid {...difficulty} />
          </FilterSection>

          <FilterSection label="Duration" summary={rangeSummary(DURATION_OPTIONS, params.minDays || '', params.maxDays || '', 'days')}>
            <OptionGrid {...range('minDays', 'maxDays', DURATION_OPTIONS)} />
          </FilterSection>

          <FilterSection label="Budget per person" summary={rangeSummary(BUDGET_OPTIONS, params.minBudget || '', params.maxBudget || '')}>
            <OptionGrid {...range('minBudget', 'maxBudget', BUDGET_OPTIONS)} />
          </FilterSection>

          <FilterSection
            label="Travel month"
            summary={params.month ? MONTHS[Number(params.month)] : undefined}
            collapsible
            defaultOpen={!!params.month}
          >
            <OptionGrid
              options={MONTHS.map((m, idx) => ({ label: m, value: String(idx) }))}
              columns={4}
              label={o => o.label}
              isSelected={o => params.month === o.value}
              onSelect={o => navigate({ month: params.month === o.value ? null : o.value })}
            />
          </FilterSection>

          <FilterSection label="Saved">
            <button
              type="button"
              role="switch"
              aria-checked={!!params.interested}
              onClick={() => navigate({ interested: params.interested ? null : 'true' })}
              className="flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Heart className={cn('h-3.5 w-3.5', params.interested && 'fill-red-500 text-red-500')} />
              <span className="flex-1">Only trips I&rsquo;m interested in</span>
              <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', params.interested ? 'bg-primary' : 'bg-foreground/15')}>
                <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-background shadow transition-all', params.interested ? 'left-3.5' : 'left-0.5')} />
              </span>
            </button>
          </FilterSection>
        </>
      ) : (
        <>
          <FilterSection label="Price" summary={rangeSummary(PRICE_OPTIONS_SERVICE, params.minPrice || '', params.maxPrice || '')}>
            <OptionGrid {...range('minPrice', 'maxPrice', PRICE_OPTIONS_SERVICE)} />
          </FilterSection>

          {activeTab === 'activities' ? (
            <FilterSection label="Difficulty" summary={difficultySummary}>
              <OptionGrid {...difficulty} />
            </FilterSection>
          ) : null}
        </>
      )}
    </div>
  )
}

export function ExploreSidebar({
  params,
  activeTab,
  resultCount,
  basePath = '/',
}: ExploreSidebarProps) {
  const { navigate, clearAll, activeCount } = useExploreFilterNav(params, basePath)
  return (
    <aside
      aria-label="Filters"
      className="sticky! top-[9.5rem] max-h-[calc(100dvh-10.25rem)] overflow-y-auto! rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-3">
        <h2 className="text-sm font-bold">Filters</h2>
        {activeCount > 0 ? (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">{activeCount}</span>
        ) : null}
        {activeCount > 0 ? (
          <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-primary hover:underline">
            Reset
          </button>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">{resultCount} results</span>
        )}
      </div>
      <ExploreFilterFields params={params} activeTab={activeTab} navigate={navigate} />
    </aside>
  )
}
