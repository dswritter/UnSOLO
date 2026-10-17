'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const CHAT_ROUTE_PREFIXES = ['/community', '/tribe', '/chat', '/status']

/**
 * Next only resets scroll when the new segment's first node is outside the
 * viewport *before* the old page unmounts; with streamed pages (loading.tsx +
 * Suspense) the window keeps the previous page's offset and the new route opens
 * scrolled to its bottom. Reset explicitly on forward navigations, but leave
 * back/forward (popstate) and in-page hash jumps to the browser.
 */
function useResetScrollOnPathChange(mainRef: React.RefObject<HTMLElement | null>, pathname: string | null) {
  const popRef = useRef(false)
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    const onPop = () => {
      popRef.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useLayoutEffect(() => {
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname
    const wasPop = popRef.current
    popRef.current = false
    if (wasPop || window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [pathname, mainRef])
}

/**
 * Wraps <main> so pb-[5.75rem] (reserved for MobileBottomNav) is omitted on
 * chat routes. On those routes the MobileBottomNav is hidden, so the padding
 * is dead space that makes <main> scrollable — causing the tribe layout to
 * shift when the user swipes from the screen edges.
 */
export function MainScrollContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mainRef = useRef<HTMLElement>(null)
  useResetScrollOnPathChange(mainRef, pathname)
  const isChatRoute = CHAT_ROUTE_PREFIXES.some(p => pathname?.startsWith(p))
  // Home/Explore scroll with the document. An unbounded overflow-auto ancestor
  // captures sticky positioning even though it never actually scrolls.
  const isHome = pathname === '/'

  return (
    <main
      ref={mainRef}
      data-wander-main-scroll
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        isHome ? 'overflow-visible' : 'h-0 overflow-y-auto',
        !isChatRoute && 'pb-[5.75rem] md:pb-0',
      )}
    >
      {children}
    </main>
  )
}
