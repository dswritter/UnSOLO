/** Route-level loading for /wander while the server page shell resolves. */
export default function WanderRouteLoading() {
  return (
    <div className="w-full min-h-[40vh] flex flex-col items-center justify-center gap-3 px-4">
      <div
        className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
        aria-hidden
      />
      <p className="text-sm text-white/65">Loading…</p>
    </div>
  )
}
