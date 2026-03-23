'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const timeoutsRef = { current: [] as NodeJS.Timeout[] }

  const startProgress = useCallback(() => {
    // Clear any pending timeouts
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []

    setProgress(30)
    timeoutsRef.current.push(setTimeout(() => setProgress(60), 200))
    timeoutsRef.current.push(setTimeout(() => setProgress(80), 600))
    timeoutsRef.current.push(setTimeout(() => setProgress(90), 1500))
  }, [])

  // Route change completed — finish the bar
  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    setProgress(100)
    const t = setTimeout(() => setProgress(0), 300)
    return () => clearTimeout(t)
  }, [pathname, searchParams])

  // Intercept ALL clicks that lead to navigation
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement

      // Check for <a> tags (direct links)
      const anchor = target.closest('a')
      if (anchor) {
        const href = anchor.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto:') && href !== pathname) {
          startProgress()
          return
        }
      }

      // Check for dropdown menu items / buttons that trigger navigation
      // These use router.push() so we monkey-patch it
      const menuItem = target.closest('[role="menuitem"]')
      if (menuItem) {
        startProgress()
        return
      }
    }

    document.addEventListener('click', handleClick, true) // capture phase
    return () => document.removeEventListener('click', handleClick, true)
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
