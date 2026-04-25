/**
 * Shown only while the community *page* segment streams. The layout (sidebar) streams
 * in parallel via Suspense, so this can stay minimal.
 */
export default function CommunityLoading() {
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  )
}
