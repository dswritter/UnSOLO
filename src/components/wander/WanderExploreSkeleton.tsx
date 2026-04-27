/**
 * Shown immediately while `loadExploreListData` streams (Wander home /wander search).
 * Matches ExploreClient wander layout roughly so the transition feels continuous.
 */
export function WanderExploreSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9"
      role="status"
      aria-live="polite"
      aria-label="Loading search results"
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        <div className="mb-4">
          <div className="h-9 w-48 max-w-[80%] rounded-lg bg-white/10 animate-pulse" />
          <div className="h-4 w-72 max-w-[90%] rounded mt-2 bg-white/5 animate-pulse" />
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-[5.5rem] sm:w-24 rounded-full bg-white/10 animate-pulse"
            />
          ))}
        </div>
        <div className="flex gap-6 flex-1">
          <div className="hidden lg:block w-64 flex-shrink-0 space-y-3">
            <div className="h-44 rounded-xl bg-white/10 animate-pulse" />
            <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.04]"
              >
                <div className="aspect-[4/3] bg-white/10 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-5 w-[80%] max-w-[14rem] rounded bg-white/10 animate-pulse" />
                  <div className="h-4 w-[55%] max-w-[10rem] rounded bg-white/5 animate-pulse" />
                  <div className="h-6 w-24 rounded bg-white/10 animate-pulse mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-white/55">Loading results…</p>
      </div>
    </div>
  )
}
