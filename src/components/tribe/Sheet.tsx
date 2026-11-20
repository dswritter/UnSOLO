'use client'

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const noopSubscribe = () => () => {}

/**
 * Full Circle bottom sheet: slides up from the bottom on phones (grab handle, actions at the bottom),
 * a centred dialog from 768px. Escape or a tap on the scrim closes it; focus moves in and is restored.
 */
export function Sheet({ open = true, title, description, onClose, children, className, labelledTitle = true }: {
  open?: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
  /** false: the title is only the accessible name (the sheet renders its own heading). */
  labelledTitle?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')
        if (f.length === 0) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    const t = requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], textarea, input, select') ?? ref.current
      el?.focus({ preventScroll: true })
    })
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(t); prev?.focus?.({ preventScroll: true }) }
  }, [open, onClose])

  if (!open || !mounted) return null
  return createPortal(
    <div className="fc-scrim" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('fc-sheet outline-none', className)} onClick={(e) => e.stopPropagation()}>
        <div className="pc-sheet-grab" aria-hidden />
        {labelledTitle && <h2 className="fc-sheet-title mt-2">{title}</h2>}
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
