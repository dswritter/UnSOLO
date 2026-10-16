'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  COLOR_MODE_CHANGED_EVENT,
  COLOR_MODE_STORAGE_KEY,
  parseStoredColorMode,
  resolveColorMode,
  type ColorMode,
} from '@/lib/theme/color-mode'

function systemMode(): ColorMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyMode(mode: ColorMode) {
  const d = document.documentElement
  d.classList.toggle('dark', mode === 'dark')
  d.style.colorScheme = mode
  d.setAttribute('data-color-mode', mode)
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== COLOR_MODE_STORAGE_KEY) return
    applyMode(resolveColorMode(parseStoredColorMode(e.newValue), systemMode()))
    onChange()
  }
  window.addEventListener(COLOR_MODE_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(COLOR_MODE_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

const getSnapshot = (): ColorMode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'
const getServerSnapshot = (): ColorMode => 'light'

export function useColorMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setMode = useCallback((next: ColorMode) => {
    try {
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, JSON.stringify({ mode: next, sys: systemMode() }))
    } catch {
      /* private mode — still apply for this page view */
    }
    applyMode(next)
    window.dispatchEvent(new Event(COLOR_MODE_CHANGED_EVENT))
  }, [])
  return { mode, setMode, toggle: () => setMode(mode === 'dark' ? 'light' : 'dark') }
}

export function ColorModeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useColorMode()
  const dark = mode === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground transition-colors hover:bg-card hover:text-primary',
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
