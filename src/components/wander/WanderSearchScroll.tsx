'use client'

import { useLayoutEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * When opening wander search results (`search=1`), smooth-scroll to the explore block
 * (below hero) so the user leaves the hero banner as in the mockup.
 */
export function WanderSearchScroll() {
  const searchParams = useSearchParams()
  const search = searchParams.get('search')

  useLayoutEffect(() => {
    if (search !== '1') return
    const t = window.setTimeout(() => {
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      document.getElementById('wander-explore')?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      })
    }, 120)
    return () => window.clearTimeout(t)
  }, [search])

  return null
}
