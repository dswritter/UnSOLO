export default function ChatRoomLoading() {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header skeleton */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="h-4 w-4 bg-secondary rounded animate-pulse md:hidden" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
          <div className="h-3 w-20 bg-secondary/60 rounded animate-pulse" />
        </div>
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="flex gap-3">
          <div className="h-7 w-7 rounded-full bg-secondary animate-pulse shrink-0" />
          <div className="space-y-1">
            <div className="h-3 w-16 bg-secondary/60 rounded animate-pulse" />
            <div className="h-8 w-48 bg-secondary rounded-2xl animate-pulse" />
          </div>
        </div>
        <div className="flex gap-3 flex-row-reverse">
          <div className="h-7 w-7 rounded-full bg-secondary animate-pulse shrink-0" />
          <div className="h-8 w-36 bg-primary/20 rounded-2xl animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-7 w-7 rounded-full bg-secondary animate-pulse shrink-0" />
          <div className="space-y-1">
            <div className="h-3 w-20 bg-secondary/60 rounded animate-pulse" />
            <div className="h-8 w-56 bg-secondary rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
      {/* Input skeleton */}
      <div className="px-4 py-3 border-t border-border">
        <div className="h-10 bg-secondary rounded-lg animate-pulse" />
      </div>
    </div>
  )
}
