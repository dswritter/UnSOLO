'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const CHAT_ROUTE_PREFIXES = ['/community', '/tribe', '/chat', '/status']

/**
 * Wraps <main> so pb-[5.75rem] (reserved for MobileBottomNav) is omitted on
 * chat routes. On those routes the MobileBottomNav is hidden, so the padding
 * is dead space that makes <main> scrollable — causing the tribe layout to
 * shift when the user swipes from the screen edges.
 */
export function MainScrollContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isChatRoute = CHAT_ROUTE_PREFIXES.some(p => pathname?.startsWith(p))

  return (
    <main
      data-wander-main-scroll
      className={cn(
        'flex h-0 min-h-0 flex-1 flex-col overflow-y-auto',
        !isChatRoute && 'pb-[5.75rem] md:pb-0',
      )}
    >
      {children}
    </main>
  )
}
