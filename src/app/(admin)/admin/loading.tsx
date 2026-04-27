/** Shown while a server page under /admin/* resolves (layout + sidebar already visible). */
export default function AdminPageLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy aria-label="Loading">
      <div className="h-9 w-48 max-w-full rounded-lg bg-white/10" />
      <div className="h-4 w-full max-w-md rounded bg-white/5" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-border bg-card/40" />
        ))}
      </div>
    </div>
  )
}
