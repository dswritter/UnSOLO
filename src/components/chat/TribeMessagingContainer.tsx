'use client'

import { usePathname } from 'next/navigation'
import { useMobileChatComposerActive } from '@/hooks/useMobileChatComposerActive'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Wraps the tribe/community messaging UI. On room pages reserves 4.5rem at
 * the bottom for MobileChatBottomBar; on the list page uses the full height
 * so there's no blank strip below the conversation list.
 */
export function TribeMessagingContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const mobileChatComposerActive = useMobileChatComposerActive()
  const isRoomPage = /^\/(tribe|community)\/[^/]+/.test(pathname || '')
  const composerViewportStyle =
    isRoomPage && mobileChatComposerActive
      ? { height: 'var(--mobile-visual-viewport-height, 100dvh)' }
      : undefined

  return (
    <div
      style={composerViewportStyle}
      className={cn(
        'tribe-messaging-ui flex flex-1 min-h-0 min-w-0 text-foreground relative px-2 sm:px-4 py-2 md:py-3 gap-3 md:gap-4 max-w-[1920px] mx-auto w-full',
        isRoomPage
          ? mobileChatComposerActive
            ? 'max-md:h-[var(--mobile-visual-viewport-height)] md:h-[calc(100dvh-4rem)]'
            : 'h-[calc(100dvh-4rem-4.5rem)] md:h-[calc(100dvh-4rem)]'
          : 'h-[calc(100dvh-4rem)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
