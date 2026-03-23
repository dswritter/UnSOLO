export default function ExploreLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10">
        {/* Title skeleton */}
        <div className="mb-8">
          <div className="h-10 w-64 bg-secondary rounded-lg animate-pulse" />
          <div className="h-5 w-96 bg-secondary/60 rounded-lg animate-pulse mt-3" />
        </div>

        {/* Filters skeleton */}
        <div className="flex gap-2 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 w-24 bg-secondary rounded-lg animate-pulse" />
          ))}
        </div>

        {/* Package grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="h-48 bg-secondary animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-secondary rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-secondary/60 rounded animate-pulse" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-6 w-24 bg-primary/20 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-secondary/60 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
