'use client'

import { useLayoutEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const EXPLORE_ANCHOR_ID = 'wander-explore'
const RETRY_MS = 45
const MAX_TRIES = 60

/**
 * When opening wander search results (`search=1`), scroll to the explore block below the hero.
 * `router.push` uses `{ scroll: false }` for in-place query updates, so we scroll here.
 * The `#wander-explore` node mounts with the RSC payload — retry until it exists (single 120ms
 * timeout was often too early).
 */
export function WanderSearchScroll() {
  const searchParams = useSearchParams()
  const search = searchParams.get('search')

  useLayoutEffect(() => {
    if (search !== '1') return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const scrollToExplore = (): boolean => {
      if (cancelled) return true
      const el = document.getElementById(EXPLORE_ANCHOR_ID)
      if (!el) return false
      el.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      })
      return true
    }

    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      if (scrollToExplore()) return

      let tries = 0
      intervalId = setInterval(() => {
        if (cancelled) {
          if (intervalId) clearInterval(intervalId)
          return
        }
        if (scrollToExplore() || ++tries >= MAX_TRIES) {
          if (intervalId) clearInterval(intervalId)
          intervalId = null
        }
      }, RETRY_MS)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (intervalId) clearInterval(intervalId)
    }
  }, [search])

  return null
}
