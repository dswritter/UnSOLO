'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const timeoutsRef = useRef<NodeJS.Timeout[]>([])
  const isNavigatingRef = useRef(false)

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  const completeProgress = useCallback(() => {
    clearTimeouts()
    isNavigatingRef.current = false
    setProgress(100)
    const t = setTimeout(() => setProgress(0), 300)
    timeoutsRef.current.push(t)
  }, [clearTimeouts])

  const startProgress = useCallback(() => {
    if (isNavigatingRef.current) return // already navigating
    isNavigatingRef.current = true

    clearTimeouts()
    setProgress(30)
    timeoutsRef.current.push(setTimeout(() => setProgress(60), 200))
    timeoutsRef.current.push(setTimeout(() => setProgress(80), 600))
    timeoutsRef.current.push(setTimeout(() => setProgress(90), 1500))
    // Safety net: force complete after 5 seconds even if pathname hasn't changed
    timeoutsRef.current.push(setTimeout(() => {
      if (isNavigatingRef.current) {
        completeProgress()
      }
    }, 5000))
  }, [clearTimeouts, completeProgress])

  // Route change completed — finish the bar
  useEffect(() => {
    if (isNavigatingRef.current) {
      completeProgress()
    }
  }, [pathname, searchParams, completeProgress])

  // Intercept clicks and pushState for navigation detection
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement

      const anchor = target.closest('a')
      if (anchor) {
        const href = anchor.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto:') && href !== pathname) {
          startProgress()
          return
        }
      }

      const menuItem = target.closest('[role="menuitem"]')
      if (menuItem) {
        startProgress()
        return
      }
    }

    // Monkey-patch pushState to catch router.push() calls
    const origPush = history.pushState.bind(history)
    history.pushState = function (...args) {
      startProgress()
      return origPush(...args)
    }

    function handleCustomNav() { startProgress() }
    window.addEventListener('unsolo:navigate', handleCustomNav)

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('unsolo:navigate', handleCustomNav)
      history.pushState = origPush
    }
  }, [pathname, startProgress])

  if (progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5">
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
