/** Shown inside WanderThemeShell while AdminShell resolves (auth + sidebar data). */
export function AdminRouteSkeleton() {
  const bar = 'animate-pulse rounded-lg bg-white/10'
  return (
    <div className="flex w-full min-h-dvh text-foreground">
      <aside className="hidden h-dvh w-[260px] min-w-[260px] shrink-0 flex-col border-r border-sidebar-border md:flex bg-sidebar/95 backdrop-blur-md p-4 space-y-3">
        <div className={`h-8 w-36 ${bar}`} />
        {[...Array(10)].map((_, i) => (
          <div key={i} className={`h-9 w-full ${bar} bg-white/5`} />
        ))}
      </aside>
      <main className="flex-1 min-w-0 pt-14 md:pt-0 px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-4">
        <div className={`h-9 w-56 ${bar}`} />
        <div className={`h-4 w-full max-w-lg ${bar} bg-white/5`} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card/30 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  )
}
