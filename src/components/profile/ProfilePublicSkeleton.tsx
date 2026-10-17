/** Mirrors `ProfileUsernameDetail`: cover + header card with stats, activity tabs, then the badges/states sidebar. */
export function ProfilePublicSkeleton() {
  const pulse = 'animate-pulse rounded-md bg-secondary/60'

  return (
    <div className="mx-auto w-full max-w-[min(100%,88rem)] px-4 py-6 sm:px-6 sm:py-10 lg:px-10 xl:px-12" aria-busy="true" aria-label="Loading profile">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10 lg:items-start lg:gap-8 xl:gap-10">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="h-24 animate-pulse bg-secondary/70 md:h-32" />
            <div className="px-5 pb-5 md:px-8 md:pb-7">
              <div className="-mt-12 flex items-end justify-between gap-3">
                <div className="rounded-full bg-card p-1">
                  <div className={`h-24 w-24 rounded-full ${pulse}`} />
                </div>
                <div className="flex gap-2 pb-1">
                  <div className={`h-8 w-20 rounded-lg ${pulse}`} />
                  <div className={`h-8 w-24 rounded-lg ${pulse}`} />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className={`h-7 w-48 max-w-full ${pulse}`} />
                <div className={`h-4 w-40 ${pulse}`} />
                <div className={`h-4 w-full max-w-lg ${pulse}`} />
                <div className={`h-4 w-36 ${pulse}`} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-5 sm:grid-cols-4">
                {[0, 1, 2, 3].map(i => <div key={i} className={`h-16 rounded-xl ${pulse}`} />)}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className={`h-9 w-56 rounded-xl ${pulse}`} />
            <div className={`h-36 rounded-2xl ${pulse}`} />
          </div>
        </div>
        <div className="space-y-6 lg:col-span-3">
          <div className={`h-56 rounded-2xl ${pulse}`} />
          <div className={`h-28 rounded-2xl ${pulse}`} />
        </div>
      </div>
    </div>
  )
}
