export default function ListingDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10 space-y-6 md:space-y-8 animate-pulse" aria-busy="true" aria-label="Loading listing">
      <div className="aspect-video w-full max-w-4xl rounded-2xl bg-secondary" />
      <div className="h-8 max-w-xl w-[min(100%,36rem)] rounded-lg bg-secondary" />
      <div className="h-5 w-48 rounded bg-secondary" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-[90%] rounded bg-secondary" />
          <div className="h-40 w-full rounded-xl bg-secondary mt-4" />
        </div>
        <div className="h-64 rounded-xl bg-secondary" />
      </div>
    </div>
  )
}
