import { TribeMainPaneSkeleton } from '@/components/chat/TribeMainPaneSkeleton'
import { TribeSidebarSkeleton } from '@/components/chat/TribeSidebarSkeleton'

/**
 * Suspense fallback for /tribe index — mobile list chrome + desktop main-pane chrome.
 */
export function TribeIndexPageFallback() {
  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <TribeSidebarSkeleton layout="mobile" />
      <div className="hidden md:flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <TribeMainPaneSkeleton className="flex-1 min-w-0" />
      </div>
    </div>
  )
}
