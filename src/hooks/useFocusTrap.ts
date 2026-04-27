'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter(el => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    const style = window.getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    return true
  })
}

/**
 * Trap Tab focus inside `containerRef` while `active`, and restore the previously
 * focused element when `active` becomes false.
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!active) return

    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const root = containerRef.current
    if (!root) return

    const focusFirst = () => {
      const list = visibleFocusables(root)
      const first = list[0]
      if (first) first.focus()
    }

    requestAnimationFrame(focusFirst)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return
      const list = visibleFocusables(root)
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const cur = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (cur === first || !root.contains(cur)) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (cur === last || !root.contains(cur)) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const prev = prevFocusRef.current
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [active, containerRef])
}
