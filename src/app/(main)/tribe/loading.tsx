export default function TribeLoading() {
  return (
    <div className="mx-auto max-w-[640px] space-y-4 px-4 pt-6" aria-busy="true" aria-label="Loading Tribe">
      <div className="pc-skel h-8 w-32" />
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="pc-skel h-9 w-20 rounded-full" />)}</div>
      {[0, 1, 2].map((i) => <div key={i} className="pc-skel h-64" />)}
    </div>
  )
}
