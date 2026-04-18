'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LandingPromoRow = {
  id: string
  title: string
  body: string | null
  href: string | null
  link_label: string | null
  variant: 'primary' | 'neutral' | 'success'
}

const STORAGE_KEY = 'unsolo_landing_promo_dismissed'

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

export function LandingPromoDock({ promos }: { promos: LandingPromoRow[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setDismissed(loadDismissed())
  }, [])

  const visible = useMemo(
    () => promos.filter((p) => !dismissed.has(p.id)),
    [promos, dismissed],
  )

  if (visible.length === 0) return null

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-40 flex flex-col gap-2 md:left-auto md:right-4 md:max-w-sm pointer-events-none"
      aria-live="polite"
    >
      {visible.map((p) => {
        const tone =
          p.variant === 'success'
            ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-50'
            : p.variant === 'neutral'
              ? 'border-border bg-card/95 text-foreground'
              : 'border-primary/50 bg-gradient-to-br from-primary/20 to-amber-950/80 text-foreground'
        return (
          <div
            key={p.id}
            className={cn(
              'pointer-events-auto rounded-xl border shadow-xl backdrop-blur-md p-4 pr-10 relative transition-all duration-300',
              tone,
            )}
          >
            <button
              type="button"
              onClick={() => dismiss(p.id)}
              className="absolute top-2 right-2 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="font-bold text-sm leading-tight">{p.title}</p>
                {p.body ? <p className="text-xs text-muted-foreground leading-snug">{p.body}</p> : null}
                {p.href ? (
                  <Link
                    href={p.href}
                    className="inline-block text-xs font-semibold text-primary hover:underline mt-1"
                  >
                    {p.link_label || 'Learn more'}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
