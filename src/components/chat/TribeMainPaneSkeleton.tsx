import { cn } from '@/lib/utils'

/**
 * Loading placeholder for /tribe main pane — matches ChatWindow header + transcript + composer rhythm.
 */
export function TribeMainPaneSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0 flex-1 border-l border-white/10 bg-transparent',
        className,
      )}
    >
      {/* Header — mirrors ChatWindow tribeShell */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-white/10 animate-pulse shrink-0" />
          <div className="min-w-0 space-y-2">
            <div className="h-4 w-40 max-w-[60vw] rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-28 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
        <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse shrink-0" />
      </div>

      {/* Message area */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 py-4 flex flex-col gap-3">
        <div className="flex justify-center">
          <div className="h-6 w-24 rounded-full bg-white/5 animate-pulse" />
        </div>
        <div className="flex justify-end">
          <div className="h-11 max-w-[72%] w-full rounded-2xl rounded-br-md bg-white/10 animate-pulse" />
        </div>
        <div className="flex justify-start">
          <div className="h-14 max-w-[78%] w-full rounded-2xl rounded-bl-md bg-white/5 animate-pulse" />
        </div>
        <div className="flex justify-end">
          <div className="h-9 max-w-[48%] w-full rounded-2xl rounded-br-md bg-white/10 animate-pulse" />
        </div>
        <div className="flex justify-start">
          <div className="h-20 max-w-[85%] w-full rounded-2xl rounded-bl-md bg-white/5 animate-pulse" />
        </div>
      </div>

      {/* Composer strip */}
      <div className="px-3 py-3 border-t border-white/10 shrink-0 flex items-end gap-2">
        <div className="flex-1 h-11 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse shrink-0" />
      </div>
    </div>
  )
}
