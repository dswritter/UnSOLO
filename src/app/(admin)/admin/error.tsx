'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface in browser console + Vercel logs
    console.error('[admin error boundary]', error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-200">
        <p className="text-base font-bold mb-2">Something went wrong loading this page</p>
        <p className="mb-3 text-white/70">{error.message || 'An unknown error occurred.'}</p>
        {error.digest && (
          <p className="text-[11px] text-white/45 font-mono mb-3">digest: {error.digest}</p>
        )}
        <button
          onClick={() => reset()}
          className="rounded-lg bg-red-500/30 hover:bg-red-500/50 px-3 py-1.5 text-xs font-semibold text-white transition"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
