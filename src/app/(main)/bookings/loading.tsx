export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <div className="h-9 w-48 bg-secondary rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-secondary/60 rounded-lg animate-pulse mt-2" />
        </div>

        {/* Booking cards skeleton */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="flex gap-4">
                <div className="h-20 w-20 rounded-xl bg-secondary animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 bg-secondary rounded animate-pulse" />
                  <div className="h-4 w-64 bg-secondary/60 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-primary/20 rounded animate-pulse" />
                </div>
                <div className="h-7 w-20 bg-secondary rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
