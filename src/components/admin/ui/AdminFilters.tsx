'use client'

import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AdminTab<K extends string> = { key: K; label: string; count?: number; href?: string }

/** Status/segment tabs shared by every admin list. Pass `href` for URL-driven tabs, or `onChange` for local state. */
export function AdminFilterTabs<K extends string>({ tabs, value, onChange, className }: {
  tabs: readonly AdminTab<K>[]
  value: K
  onChange?: (key: K) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1.5', className)}>
      {tabs.map(tab => {
        const active = tab.key === value
        const classes = cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          active ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground',
        )
        const content = (
          <>
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground/80')}>{tab.count}</span>
            ) : null}
          </>
        )
        return tab.href ? (
          <Link key={tab.key} role="tab" aria-selected={active} href={tab.href} className={classes} scroll={false}>{content}</Link>
        ) : (
          <button key={tab.key} role="tab" aria-selected={active} type="button" onClick={() => onChange?.(tab.key)} className={classes}>{content}</button>
        )
      })}
    </div>
  )
}

export function AdminSearchInput({ value, onChange, placeholder = 'Search', className }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div role="search" className={cn('flex h-9 items-center gap-2 rounded-full border border-border bg-white/5 pl-3 pr-1.5 focus-within:ring-2 focus-within:ring-primary/40', className)}>
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="input-bare min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Search on the left, tabs on the right (stacked on mobile). */
export function AdminFilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>{children}</div>
}
