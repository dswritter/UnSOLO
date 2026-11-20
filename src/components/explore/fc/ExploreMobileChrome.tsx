'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Backpack, BedDouble, Bike, Loader2, MapPin, MessageSquare, Mountain, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/layout/AuthProvider'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { WanderNominatimLocationInput } from '@/components/wander/WanderNominatimLocationInput'
import { WANDER_TAB_CHANGE_EVENT } from '@/components/wander/WanderMobileTabNav'
import { pushExploreUrl } from '@/lib/explore/pushExploreUrl'

type Tab = 'trips' | 'stays' | 'activities' | 'rentals'
const TABS: { id: Tab; label: string; icon: typeof Backpack }[] = [
  { id: 'trips', label: 'Trips', icon: Backpack },
  { id: 'stays', label: 'Stays', icon: BedDouble },
  { id: 'activities', label: 'Activities', icon: Mountain },
  { id: 'rentals', label: 'Rentals', icon: Bike },
]
const asTab = (v: string | null): Tab | null => (v === 'trips' || v === 'stays' || v === 'activities' || v === 'rentals' ? v : null)

function months(): { id: string; label: string }[] {
  const out = [{ id: '', label: 'Any time' }]
  const d = new Date()
  for (let i = 0; i < 4; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    out.push({ id: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: i === 0 ? 'This month' : m.toLocaleDateString('en-IN', { month: 'short' }) })
  }
  return out
}

/** Mobile Explore top bar: wordmark + Messages + Activity. Glance targets only; search lives at the bottom. */
export function ExploreMobileTopBar() {
  const { userId } = useAuth()
  return (
    <header className="flex h-14 items-center gap-1 px-4 md:hidden">
      <Link href="/" className="pc-wordmark mr-auto" aria-label="UnSOLO home"><b>UN</b>SOLO</Link>
      {userId ? (
        <>
          <Link href="/community" prefetch={false} className="pc-iconbtn" aria-label="Messages"><MessageSquare className="h-[22px] w-[22px]" aria-hidden /></Link>
          <NotificationBell userId={userId} />
        </>
      ) : (
        <Link href="/login" className="pc-btn pc-btn-sm pc-btn-quiet">Sign in</Link>
      )}
    </header>
  )
}

/** Category chips (Trips / Stays / Activities / Rentals); writes `?tab=` like the old strip. */
export function ExploreCategoryChips({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, setPending] = useState<Tab | null>(null)
  const [, start] = useTransition()
  const tab = pending ?? asTab(sp.get('tab')) ?? 'trips'
  function pick(next: Tab) {
    setPending(next)
    window.dispatchEvent(new CustomEvent(WANDER_TAB_CHANGE_EVENT, { detail: next }))
    start(() => {
      const p = new URLSearchParams(sp.toString())
      p.set('tab', next)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
      setPending(null)
    })
  }
  return (
    <div className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide', className)} role="tablist" aria-label="What are you looking for?">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} className="pc-chip" onClick={() => pick(id)}>
          <Icon className="h-4 w-4" aria-hidden />{label}
        </button>
      ))}
    </div>
  )
}

/**
 * Thumb-reach search: a floating pill docked above the tab bar ("Where to? · Any time"), opening a
 * bottom sheet with destination, month and category. Submits to the existing `?search=1` results.
 */
export function ExploreSearchDock() {
  const router = useRouter()
  const sp = useSearchParams()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [where, setWhere] = useState(sp.get('q') ?? '')
  const [month, setMonth] = useState(sp.get('month') ?? '')
  const [tab, setTab] = useState<Tab>(asTab(sp.get('tab')) ?? 'trips')
  const monthList = months()
  const monthLabel = monthList.find((m) => m.id === month)?.label ?? 'Any time'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  function go() {
    const p = new URLSearchParams()
    p.set('tab', tab)
    if (where.trim()) p.set('q', where.trim())
    if (month && (tab === 'trips' || tab === 'activities')) p.set('month', month)
    p.set('search', '1')
    start(() => {
      pushExploreUrl(router, '/', `/?${p.toString()}#wander-explore`)
      setOpen(false)
    })
  }

  return (
    <>
      <div className="pc-dock md:hidden" role="search">
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left" aria-haspopup="dialog">
          <Search className="h-5 w-5 shrink-0 text-[color:var(--pc-accent-ink)]" strokeWidth={2.4} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight">{where.trim() || 'Where to?'}</span>
            <span className="block truncate text-[12.5px] leading-tight text-muted-foreground">{monthLabel} · {TABS.find((t) => t.id === tab)?.label}</span>
          </span>
        </button>
        <button type="button" onClick={() => setOpen(true)} className="pc-iconbtn bg-[color:var(--pc-tonal)]" aria-label="Filters"><SlidersHorizontal className="h-5 w-5" aria-hidden /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Search trips and stays">
          <button type="button" className="absolute inset-0 bg-[color:var(--pc-scrim)]" aria-label="Close" onClick={() => !pending && setOpen(false)} />
          <div className="pc-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto px-4 pb-4 shadow-[0_-12px_40px_rgba(0,0,0,0.25)]">
            <div className="pc-sheet-grab" />
            <div className="flex items-center justify-between py-2">
              <h2 className="text-[22px]">Where to?</h2>
              <button type="button" className="pc-iconbtn" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide" role="radiogroup" aria-label="Category">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={tab === id} className="pc-chip" onClick={() => setTab(id)}><Icon className="h-4 w-4" aria-hidden />{label}</button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="pc-eyebrow">Destination</span>
              <span className="relative mt-2 block">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <WanderNominatimLocationInput className="pc-input pl-10" placeholder="Spiti, Rishikesh, Bhutan…" value={where} onValueChange={setWhere} wander />
              </span>
            </label>
            {(tab === 'trips' || tab === 'activities') && (
              <div className="mt-5">
                <span className="pc-eyebrow">When</span>
                <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="radiogroup" aria-label="Month">
                  {monthList.map((m) => (
                    <button key={m.id || 'any'} type="button" role="radio" aria-checked={month === m.id} className="pc-chip" onClick={() => setMonth(m.id)}>{m.label}</button>
                  ))}
                </div>
              </div>
            )}
            <button type="button" onClick={go} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3.5 text-left text-[15px] font-semibold">
              More filters<span className="text-[13px] font-medium text-muted-foreground">Budget, length, difficulty</span>
            </button>
            <div className="sticky bottom-0 -mx-4 mt-4 flex gap-3 border-t border-border bg-[color:var(--pc-raised)] px-4 pb-1 pt-3">
              <button type="button" className="pc-btn pc-btn-quiet" onClick={() => { setWhere(''); setMonth('') }}>Clear</button>
              <button type="button" className="pc-btn flex-1" onClick={go} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                {pending ? 'Searching…' : `Show ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
