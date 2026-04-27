/**
 * Matches `ProfileUsernameDetail`: 7+3 grid, hero, status rail, list cards, TravelStats-style tier card,
 * sidebar “Achievements & stats” → At a glance → Badges → States (desktop); same stack on mobile.
 */
export function ProfilePublicSkeleton() {
  const pulse = 'animate-pulse bg-secondary/50 rounded-md'
  const card = 'bg-card border border-border rounded-2xl'
  const innerCard = 'bg-card border border-border rounded-xl'

  return (
    <div className="mx-auto w-full max-w-[min(100%,88rem)] px-4 sm:px-6 lg:px-10 xl:px-12 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10 lg:gap-8 xl:gap-10 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          {/* Hero — same shell as profile header card */}
          <div className={`${card} p-6 md:p-8`}>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className={`h-24 w-24 rounded-full border-2 border-primary/30 shrink-0 ${pulse} bg-secondary/30`} />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className={`h-8 w-48 max-w-full ${pulse}`} />
                    <div className={`h-4 w-28 ${pulse}`} />
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <div className={`h-8 w-24 rounded-lg ${pulse}`} />
                    <div className={`h-8 w-28 rounded-lg ${pulse}`} />
                  </div>
                </div>
                <div className={`h-4 w-full max-w-xl ${pulse}`} />
                <div className={`h-4 w-full max-w-lg ${pulse}`} />
                <div className="flex gap-4 pt-1">
                  <div className={`h-4 w-20 ${pulse}`} />
                  <div className={`h-4 w-20 ${pulse}`} />
                  <div className={`h-4 w-20 ${pulse}`} />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <div className={`h-6 w-16 rounded-full ${pulse}`} />
                  <div className={`h-6 w-20 rounded-full ${pulse}`} />
                  <div className={`h-6 w-14 rounded-full ${pulse}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Status rail strip */}
          <div className={`${innerCard} p-3 flex gap-2 overflow-hidden`}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`h-14 w-14 shrink-0 rounded-full ${pulse} bg-secondary/30`} />
            ))}
          </div>

          {/* Travel history–style card */}
          <div className={`${innerCard} p-5`}>
            <div className={`h-5 w-40 ${pulse} mb-4`} />
            <div className="space-y-0">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <div className={`h-10 w-10 rounded-xl shrink-0 ${pulse}`} />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className={`h-4 w-full max-w-sm ${pulse}`} />
                    <div className={`h-3 w-full max-w-md ${pulse}`} />
                  </div>
                  <div className={`h-6 w-16 rounded-md shrink-0 ${pulse}`} />
                </div>
              ))}
            </div>
          </div>

          {/* TravelStats tier card (deferToSidebar main column) */}
          <div className={`${innerCard} overflow-hidden`}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl ${pulse}`} />
                  <div className="space-y-2">
                    <div className={`h-3 w-20 ${pulse}`} />
                    <div className={`h-5 w-28 ${pulse}`} />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className={`h-8 w-14 ml-auto ${pulse}`} />
                  <div className={`h-3 w-16 ml-auto ${pulse}`} />
                </div>
              </div>
              <div className={`h-2 w-full rounded-full ${pulse} bg-secondary/30`} />
              <div className={`h-3 w-48 mx-auto mt-3 ${pulse}`} />
            </div>
          </div>

          {/* Mobile-only sidebar stack (lg:hidden) */}
          <div className="space-y-6 lg:hidden">
            <SidebarBlocks pulse={pulse} innerCard={innerCard} />
          </div>
        </div>

        <aside className="hidden min-w-0 lg:col-span-3 lg:flex lg:flex-col lg:gap-6 lg:sticky lg:top-20 xl:top-24 lg:self-start">
          <SidebarBlocks pulse={pulse} innerCard={innerCard} />
        </aside>
      </div>
    </div>
  )
}

function SidebarBlocks({
  pulse,
  innerCard,
}: {
  pulse: string
  innerCard: string
}) {
  return (
    <>
      <div className="rounded-xl border border-border/80 bg-secondary/20 px-3 py-2.5">
        <div className={`h-3 w-36 ${pulse}`} />
      </div>
      <div className={`${innerCard} p-5 shadow-sm`}>
        <div className={`h-4 w-28 ${pulse} mb-4`} />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="space-y-2 text-center">
              <div className={`h-4 w-4 mx-auto rounded ${pulse}`} />
              <div className={`h-7 w-8 mx-auto rounded ${pulse}`} />
              <div className={`h-3 w-10 mx-auto ${pulse}`} />
            </div>
          ))}
        </div>
        <div className={`mt-4 h-10 rounded-xl ${pulse}`} />
      </div>
      <div className={`${innerCard} p-5`}>
        <div className={`h-5 w-24 ${pulse} mb-4`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`h-20 rounded-xl ${pulse} bg-secondary/30`} />
          ))}
        </div>
      </div>
      <div className={`${innerCard} p-5`}>
        <div className={`h-5 w-36 ${pulse} mb-4`} />
        <div className={`aspect-[4/3] max-h-[220px] rounded-lg ${pulse} bg-secondary/30 mb-4`} />
        <div className="flex flex-wrap gap-1.5">
          {[...Array(12)].map((_, i) => (
            <div key={i} className={`h-6 w-14 rounded-md ${pulse}`} />
          ))}
        </div>
      </div>
    </>
  )
}
