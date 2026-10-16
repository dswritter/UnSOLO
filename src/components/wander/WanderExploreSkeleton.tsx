/**
 * Shown while `loadExploreListData` streams on the homepage search section.
 * Matches ExploreClient wander layout for a continuous transition.
 */
export function WanderExploreSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 md:pt-5 lg:px-8"
      role="status"
      aria-live="polite"
      aria-label="Loading search results"
    >
      <div className="mb-5 hidden h-[3.25rem] rounded-2xl bg-foreground/[0.06] animate-pulse md:block" />
      <div className="mb-4 h-11 rounded-full bg-foreground/[0.06] animate-pulse md:hidden" />
      <div className="flex items-start gap-6 lg:gap-8">
        <div className="hidden w-60 shrink-0 space-y-3 lg:block">
          <div className="h-80 rounded-2xl bg-foreground/[0.07] animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-foreground/10 animate-pulse" />
            <div className="h-9 w-40 rounded-full bg-foreground/[0.07] animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.04]"
              >
                <div className="aspect-[9/16] bg-foreground/10 animate-pulse md:aspect-[4/3]" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-[80%] max-w-[14rem] rounded bg-foreground/10 animate-pulse" />
                  <div className="h-4 w-[55%] max-w-[10rem] rounded bg-foreground/5 animate-pulse" />
                  <div className="mt-3 h-6 w-24 rounded bg-foreground/10 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
