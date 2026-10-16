'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

// Shared components may render outside the admin shell (e.g. host dashboard).
const fallbackConfirm = async (options: ConfirmOptions) => window.confirm(options.title)

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

/** Promise-based replacement for window.confirm: `if (!(await confirm({ title }))) return`. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  return confirm ?? fallbackConfirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    setPending({ ...options, resolve })
  }), [])

  const close = useCallback((ok: boolean) => {
    setPending(current => {
      current?.resolve(ok)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? <ConfirmDialog options={pending} onClose={close} /> : null}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const danger = options.tone === 'danger'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(false)} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-desc"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex gap-3">
          {danger ? (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id="admin-confirm-title" className="text-base font-bold text-foreground">{options.title}</h2>
            {options.description ? (
              <div id="admin-confirm-desc" className="mt-1 text-sm text-muted-foreground">{options.description}</div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={confirmRef} type="button" onClick={() => onClose(true)}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold',
              danger ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
