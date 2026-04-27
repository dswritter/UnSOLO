export default function HostLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-10 min-h-[60vh]">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="h-10 w-64 bg-secondary rounded-lg animate-pulse" />
            <div className="h-5 w-80 bg-secondary/60 rounded-lg animate-pulse mt-3" />
          </div>
          <div className="h-10 w-40 bg-primary/20 rounded-lg animate-pulse" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-secondary animate-pulse" />
                <div className="h-3 w-20 bg-secondary/60 rounded animate-pulse" />
              </div>
              <div className="h-8 w-16 bg-secondary rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Trip list skeleton */}
        <div className="h-6 w-32 bg-secondary rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-24 bg-secondary rounded-lg animate-pulse hidden sm:block" />
                  <div className="space-y-2">
                    <div className="h-5 w-48 bg-secondary rounded animate-pulse" />
                    <div className="h-4 w-64 bg-secondary/60 rounded animate-pulse" />
                    <div className="h-3 w-40 bg-secondary/40 rounded animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-4 w-24 bg-secondary/60 rounded animate-pulse" />
                  <div className="h-8 w-20 bg-secondary rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
    </div>
  )
}
