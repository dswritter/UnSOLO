'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ProfileTab = { id: string; label: string; count?: number; content: ReactNode }

export function ProfileSectionTabs({ tabs }: { tabs: ProfileTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  if (tabs.length === 0) return null
  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Profile sections" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-foreground/[0.05] p-1 scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current.id}
            onClick={() => setActive(t.id)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              t.id === current.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 opacity-70">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current.content}</div>
    </div>
  )
}
