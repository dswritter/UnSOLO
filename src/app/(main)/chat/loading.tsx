export default function ChatLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <div className="h-9 w-56 bg-muted rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-muted/80 rounded-lg animate-pulse mt-2" />
        </div>

        {/* Active users skeleton */}
        <div className="mb-6">
          <div className="h-5 w-40 bg-muted rounded animate-pulse mb-3" />
          <div className="flex gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                <div className="h-3 w-16 bg-muted/80 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Chat rooms skeleton */}
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                <div className="h-3 w-48 bg-muted/80 rounded animate-pulse" />
              </div>
              <div className="h-3 w-12 bg-muted/80 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
