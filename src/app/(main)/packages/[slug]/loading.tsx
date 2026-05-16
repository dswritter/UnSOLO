export default function PackageDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10 space-y-6 md:space-y-8 animate-pulse" aria-busy="true" aria-label="Loading trip">
      <div className="aspect-[21/9] max-h-[220px] md:max-h-[280px] w-full rounded-2xl bg-secondary" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-8 w-28 rounded-full bg-secondary" />
        <div className="h-8 w-24 rounded-full bg-secondary" />
      </div>
      <div className="h-9 w-full max-w-2xl rounded-lg bg-secondary" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-[92%] rounded bg-secondary" />
          <div className="h-4 w-[88%] rounded bg-secondary" />
          <div className="h-32 w-full rounded-xl bg-secondary mt-4" />
        </div>
        <div className="h-72 rounded-xl bg-secondary lg:mt-0" />
      </div>
    </div>
  )
}
