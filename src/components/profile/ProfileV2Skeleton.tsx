/**
 * Loading placeholder for profile routes using ProfileV2Shell (dark forest theme).
 * Avoids a light `bg-background` flash before the themed shell paints.
 */
export function ProfileV2Skeleton() {
  const pulse = 'animate-pulse rounded bg-white/10'
  return (
    <div className="min-h-dvh w-full px-4 sm:px-6 lg:px-10 xl:px-12 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10 lg:gap-8 xl:gap-10 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className={`h-24 w-24 rounded-full shrink-0 ${pulse}`} />
              <div className="flex-1 space-y-3 min-w-0 w-full">
                <div className={`h-8 w-48 max-w-full ${pulse}`} />
                <div className={`h-4 w-32 ${pulse} bg-white/[0.07]`} />
                <div className={`h-4 w-full max-w-xl ${pulse} bg-white/[0.07]`} />
                <div className={`h-4 w-2/3 max-w-md ${pulse} bg-white/[0.07]`} />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className={`h-14 w-24 ${pulse} bg-white/[0.07]`} />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <div className={`h-5 w-40 ${pulse} mb-4`} />
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex gap-3 py-2 border-b border-white/10 last:border-0">
                  <div className={`h-10 w-10 rounded-xl shrink-0 ${pulse}`} />
                  <div className="flex-1 space-y-2">
                    <div className={`h-4 w-3/5 max-w-xs ${pulse}`} />
                    <div className={`h-3 w-4/5 max-w-sm ${pulse} bg-white/[0.07]`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="hidden min-w-0 lg:col-span-3 lg:block space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <div className={`h-4 w-24 ${pulse} mb-4`} />
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="space-y-2 text-center">
                  <div className={`h-4 w-4 mx-auto ${pulse}`} />
                  <div className={`h-7 w-8 mx-auto ${pulse}`} />
                  <div className={`h-3 w-10 mx-auto ${pulse} bg-white/[0.07]`} />
                </div>
              ))}
            </div>
            <div className={`mt-4 h-10 rounded-xl ${pulse} bg-white/[0.07]`} />
          </div>
        </aside>
      </div>
    </div>
  )
}
