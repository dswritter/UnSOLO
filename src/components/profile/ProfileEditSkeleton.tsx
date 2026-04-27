/**
 * Matches `EditProfileView` (v2): narrow column, header + View Profile CTA, stacked cards with form fields.
 */
export function ProfileEditSkeleton() {
  const pulse = 'animate-pulse bg-secondary/50 rounded-md'
  const card = 'bg-card border border-border rounded-xl'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className={`h-9 w-56 max-w-full ${pulse} rounded-lg`} />
          <div className={`h-4 w-44 ${pulse}`} />
        </div>
        <div className={`h-9 w-28 shrink-0 rounded-lg ${pulse}`} />
      </div>

      {/* Main form card */}
      <div className={`${card}`}>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-full border border-border shrink-0 ${pulse} bg-secondary/30`} />
            <div className="flex-1 space-y-2">
              <div className={`h-5 w-40 ${pulse}`} />
              <div className={`h-4 w-32 ${pulse}`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className={`h-3 w-20 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
            <div className="space-y-2">
              <div className={`h-3 w-16 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
          </div>

          <div className="space-y-2">
            <div className={`h-3 w-28 ${pulse}`} />
            <div className={`h-10 w-full max-w-xs rounded-lg ${pulse}`} />
            <div className={`h-3 w-full max-w-md ${pulse}`} />
          </div>

          <div className="space-y-2">
            <div className={`h-3 w-12 ${pulse}`} />
            <div className={`h-20 w-full rounded-lg ${pulse}`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className={`h-3 w-32 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
            <div className="space-y-2">
              <div className={`h-3 w-16 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
          </div>

          <div className={`h-11 w-full rounded-lg ${pulse} bg-primary/20`} />
        </div>

        {/* Phone section */}
        <div className="border-t border-border px-6 py-5 space-y-3">
          <div className={`h-5 w-48 ${pulse}`} />
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <div className={`h-3 w-24 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
            <div className="space-y-2 w-28">
              <div className={`h-3 w-16 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg ${pulse}`} />
            </div>
          </div>
          <div className={`h-8 w-36 ml-auto rounded-lg ${pulse}`} />
        </div>
      </div>

      {/* Privacy card */}
      <div className={`${card} mt-6 p-5 space-y-4`}>
        <div className={`h-6 w-40 ${pulse}`} />
        <div className={`h-3 w-full max-w-lg ${pulse}`} />
        <div className={`h-12 w-full rounded-lg ${pulse}`} />
        <div className={`h-12 w-full rounded-lg ${pulse}`} />
        <div className={`h-8 w-44 rounded-lg ${pulse}`} />
      </div>

      {/* Status card */}
      <div className={`${card} mt-6 p-5 space-y-4`}>
        <div className={`h-6 w-32 ${pulse}`} />
        <div className={`h-3 w-full max-w-md ${pulse}`} />
        <div className={`h-10 w-full rounded-lg ${pulse}`} />
        <div className="flex gap-2">
          <div className={`h-10 flex-1 rounded-lg ${pulse}`} />
          <div className={`h-10 flex-1 rounded-lg ${pulse}`} />
        </div>
        <div className={`h-8 w-28 rounded-lg ${pulse}`} />
      </div>
    </div>
  )
}
