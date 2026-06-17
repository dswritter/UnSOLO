'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteServiceListing, hardDeleteServiceListing } from '@/actions/admin-service-listings'

/** Delete a service listing from the individual edit view. Archives active
 *  listings (history preserved); permanently removes archived/rejected ones. */
export function DeleteListingButton({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isHard = status === 'archived' || status === 'rejected'

  function onClick() {
    const msg = isHard
      ? 'Permanently delete this listing? This CANNOT be undone and all booking history will be unlinked.'
      : 'Delete this listing? It will be archived and hidden from travellers. Booking history is preserved.'
    if (!window.confirm(msg)) return
    startTransition(async () => {
      try {
        if (isHard) await hardDeleteServiceListing(id)
        else await deleteServiceListing(id)
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
      {isPending ? 'Deleting…' : isHard ? 'Delete permanently' : 'Delete listing'}
    </button>
  )
}
