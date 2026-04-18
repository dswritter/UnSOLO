export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[min(100%,88rem)] px-4 sm:px-6 lg:px-10 xl:px-12 py-10">
        {/* Header — matches profile header width */}
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8 mb-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="h-24 w-24 rounded-full bg-secondary animate-pulse shrink-0" />
            <div className="flex-1 space-y-3 min-w-0 w-full">
              <div className="h-8 w-48 max-w-full bg-secondary rounded animate-pulse" />
              <div className="h-4 w-32 bg-secondary/60 rounded animate-pulse" />
              <div className="h-4 w-full max-w-xl bg-secondary/60 rounded animate-pulse" />
              <div className="h-4 w-2/3 max-w-md bg-secondary/60 rounded animate-pulse" />
              <div className="mt-6 pt-6 border-t border-border lg:hidden">
                <div className="grid grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="space-y-2 text-center">
                      <div className="h-4 w-4 bg-secondary rounded mx-auto animate-pulse" />
                      <div className="h-7 w-8 bg-secondary rounded mx-auto animate-pulse" />
                      <div className="h-3 w-12 bg-secondary/60 rounded mx-auto animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status rail placeholder */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6">
          <div className="h-14 w-24 bg-secondary/60 rounded-lg animate-pulse" />
        </div>

        {/* Main + sidebar — matches lg:flex layout */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8 xl:gap-10">
          <div className="min-w-0 flex-1 space-y-6 lg:flex-[2] lg:basis-0">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-5 w-40 bg-secondary rounded mb-4 animate-pulse" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
                    <div className="h-10 w-10 rounded-xl bg-secondary animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/5 max-w-xs bg-secondary rounded animate-pulse" />
                      <div className="h-3 w-4/5 max-w-sm bg-secondary/60 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-5 w-32 bg-secondary rounded mb-4 animate-pulse" />
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="border-b border-border pb-4 last:border-0 space-y-2">
                    <div className="h-4 w-2/3 max-w-sm bg-secondary rounded animate-pulse" />
                    <div className="h-3 w-full max-w-md bg-secondary/60 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>

            {/* Current tier + places (TravelStats) — main column only */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-6 w-40 bg-secondary rounded mb-4 animate-pulse" />
              <div className="h-2 w-full bg-secondary/30 rounded-full animate-pulse mb-6" />
              <div className="h-4 w-64 bg-secondary/60 rounded animate-pulse mb-4" />
              <div className="h-4 w-48 bg-secondary/50 rounded animate-pulse" />
            </div>

            {/* Narrow screens: sidebar blocks stacked */}
            <div className="space-y-6 lg:hidden">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="h-5 w-28 bg-secondary rounded mb-4 animate-pulse" />
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="h-5 w-36 bg-secondary rounded mb-4 animate-pulse" />
                <div className="aspect-[4/3] max-h-[200px] rounded-lg bg-secondary/30 animate-pulse mb-4" />
                <div className="flex flex-wrap gap-1.5">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="h-6 w-16 rounded-md bg-secondary/50 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden lg:flex lg:min-w-0 lg:flex-1 lg:basis-0 lg:max-w-md flex-col gap-6">
            <div className="rounded-xl border border-border/80 bg-secondary/20 px-3 py-2">
              <div className="h-3 w-36 bg-secondary/60 rounded animate-pulse" />
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="h-4 w-24 bg-secondary/70 rounded mb-4 animate-pulse" />
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2 text-center">
                    <div className="h-4 w-4 bg-secondary rounded mx-auto animate-pulse" />
                    <div className="h-7 w-8 bg-secondary rounded mx-auto animate-pulse" />
                    <div className="h-3 w-10 bg-secondary/60 rounded mx-auto animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="mt-4 h-10 rounded-xl bg-secondary/40 animate-pulse" />
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-5 w-24 bg-secondary rounded mb-4 animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-5 w-36 bg-secondary rounded mb-4 animate-pulse" />
              <div className="aspect-[4/3] max-h-[220px] rounded-lg bg-secondary/30 animate-pulse mb-4" />
              <div className="flex flex-wrap gap-1.5">
                {[...Array(16)].map((_, i) => (
                  <div key={i} className="h-6 w-14 rounded-md bg-secondary/50 animate-pulse" />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
