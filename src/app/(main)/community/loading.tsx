export default function CommunityLoading() {
  return (
    <div className="h-[calc(100dvh-64px)] flex bg-background text-foreground min-h-0">
      {/* Desktop sidebar skeleton */}
      <div className="hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0 flex-col p-4 gap-3">
        <div className="h-10 w-full rounded-lg bg-muted animate-pulse mb-2" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Mobile sidebar skeleton */}
      <div className="flex md:hidden flex-col flex-1 p-4 gap-3">
        <div className="h-10 w-full rounded-lg bg-muted animate-pulse mb-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop content area */}
      <div className="hidden md:flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm animate-pulse">Loading chats…</p>
      </div>
    </div>
  )
}
