'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LandingPromoRow = {
  id: string
  title: string
  body: string | null
  href: string | null
  link_label: string | null
  image_url: string | null
  variant: 'primary' | 'neutral' | 'success'
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href.trim())
}

function PromoCta({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const h = href.trim()
  if (isExternalHref(h)) {
    return (
      <a href={h} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={h} className={className}>
      {children}
    </Link>
  )
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

export function LandingPromoDock({
  promos,
  liftForChatFab = false,
}: {
  promos: LandingPromoRow[]
  /** When true, position above the floating chat button (logged-in home). */
  liftForChatFab?: boolean
}) {
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
      className={cn(
        'fixed z-[60] flex flex-col gap-2 pointer-events-none',
        'left-4 right-4 md:left-auto md:max-w-sm md:w-full',
        liftForChatFab ? 'bottom-24 md:right-24' : 'bottom-4 md:right-6',
      )}
      aria-live="polite"
    >
      {visible.map((p) => {
        const tone =
          p.variant === 'success'
            ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-50'
            : p.variant === 'neutral'
              ? 'border-border bg-card/95 text-foreground'
              : 'border-primary/50 bg-gradient-to-br from-primary/20 to-amber-950/80 text-foreground'
        const img = p.image_url?.trim()
        return (
          <div
            key={p.id}
            className={cn(
              'pointer-events-auto rounded-xl border shadow-xl backdrop-blur-md p-4 pr-12 relative transition-all duration-300 isolate',
              tone,
            )}
          >
            <button
              type="button"
              onClick={() => dismiss(p.id)}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-background/80 dark:bg-black/40 border border-border/60 shadow-sm hover:bg-background dark:hover:bg-black/60 text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-supplied arbitrary image URLs
                <img
                  src={img}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover border border-white/10 bg-black/20"
                />
              ) : (
                <Sparkles className="h-4 w-4 shrink-0 text-primary mt-1" />
              )}
              <div className="min-w-0 space-y-1 flex-1">
                <p className="font-bold text-sm leading-tight">{p.title}</p>
                {p.body ? <p className="text-xs text-muted-foreground leading-snug">{p.body}</p> : null}
                {p.href ? (
                  <PromoCta
                    href={p.href}
                    className="inline-block text-xs font-semibold text-primary hover:underline mt-1"
                  >
                    {p.link_label || 'Learn more'}
                  </PromoCta>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
