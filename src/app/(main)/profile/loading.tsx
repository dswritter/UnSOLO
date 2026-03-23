export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Profile header skeleton */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-5">
            <div className="h-20 w-20 rounded-full bg-secondary animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-7 w-40 bg-secondary rounded animate-pulse" />
              <div className="h-4 w-28 bg-secondary/60 rounded animate-pulse" />
              <div className="h-4 w-64 bg-secondary/60 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="rounded-xl border border-border bg-card p-6 mt-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-4 bg-secondary rounded mx-auto animate-pulse" />
                <div className="h-7 w-8 bg-secondary rounded mx-auto animate-pulse" />
                <div className="h-3 w-12 bg-secondary/60 rounded mx-auto animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
