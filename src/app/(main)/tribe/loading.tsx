export default function TribeLoading() {
  return (
    <div className="mx-auto max-w-[640px] space-y-4 px-4 pt-4" aria-busy="true" aria-label="Loading Tribe">
      <div className="pc-skel h-9 w-28" />
      <div className="flex gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pc-skel h-16 w-16 shrink-0 rounded-full" />)}</div>
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="pc-skel h-10 w-20 rounded-full" />)}</div>
      {[0, 1].map((i) => <div key={i} className="pc-skel h-72 rounded-[var(--pc-radius-card)]" />)}
    </div>
  )
}
