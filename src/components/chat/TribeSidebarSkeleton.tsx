import { cn } from '@/lib/utils'

type TribeSidebarSkeletonLayout = 'desktop' | 'mobile'

/**
 * Matches ChatSidebar structure (header, search, filters, rows) for stable layout swap.
 */
export function TribeSidebarSkeleton({
  className,
  layout = 'desktop',
}: {
  className?: string
  /** `desktop` = left rail in layout; `mobile` = full-width tribe index list (md:hidden). */
  layout?: TribeSidebarSkeletonLayout
}) {
  return (
    <div
      className={cn(
        'flex-col border-r border-border max-h-[min(100dvh-5.5rem,56rem)] overflow-hidden wander-frost-panel bg-[oklch(0.2_0.045_155/0.5)]',
        layout === 'desktop' &&
          'hidden md:flex w-96 min-w-[384px] shrink-0 border-white/10 rounded-2xl',
        layout === 'mobile' && 'flex md:hidden w-full flex-1 min-h-0 max-h-full shrink-0 min-w-0 border-0 rounded-none',
        className,
      )}
    >
      {/* Header — px-4 py-3 border-b like ChatSidebar */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="space-y-2">
            <div className="h-5 w-24 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-[220px] max-w-full rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-[180px] max-w-full rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-8 w-8 rounded-md bg-white/5 animate-pulse shrink-0" />
        </div>
        <div className="relative mb-3 h-9 w-full rounded-lg bg-white/5 animate-pulse" />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-14 rounded-full bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Room rows — py-3 px-4, gap-2, avatar h-11 w-11 */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col gap-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-3 border-b border-border/30 w-full"
          >
            <div className="h-11 w-11 rounded-full bg-white/10 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 flex-1 max-w-[180px] rounded bg-white/10 animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-white/5 animate-pulse shrink-0" />
              </div>
              <div className="h-3 w-[85%] rounded bg-white/5 animate-pulse" />
            </div>
            <div className="h-3.5 w-3.5 rounded bg-white/5 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
