'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // When route changes, stop the loader
    setLoading(false)
    setProgress(100)
    const timeout = setTimeout(() => setProgress(0), 300)
    return () => clearTimeout(timeout)
  }, [pathname, searchParams])

  // Intercept link clicks to start the loader
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) return
      // Internal navigation — start progress
      setLoading(true)
      setProgress(30)
      // Simulate progress
      const t1 = setTimeout(() => setProgress(60), 200)
      const t2 = setTimeout(() => setProgress(80), 600)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  if (progress === 0 && !loading) return null

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
