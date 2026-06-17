'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { hardDeleteServiceListing } from '@/actions/admin-service-listings'

/** Permanently delete a service listing from the individual edit view. */
export function DeleteListingButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    if (!window.confirm('Permanently delete this listing? This cannot be undone. (Listings with existing bookings cannot be deleted.)')) return
    startTransition(async () => {
      try {
        await hardDeleteServiceListing(id)
        router.push('/admin/service-listings')
      } catch (e) {
        alert(`Error: ${e instanceof Error ? e.message : 'Could not delete'}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete listing'}
    </button>
  )
}
