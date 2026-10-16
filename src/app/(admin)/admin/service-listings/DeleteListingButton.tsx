'use client'

import { toast } from 'sonner'
import { useConfirm } from '@/components/admin/ui/ConfirmDialog'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { hardDeleteServiceListing } from '@/actions/admin-service-listings'

/** Permanently delete a service listing from the individual edit view. */
export function DeleteListingButton({ id }: { id: string }) {
  const router = useRouter()
  const confirmAction = useConfirm()
  const [isPending, startTransition] = useTransition()

  async function onClick() {
    if (!(await confirmAction({ title: 'Delete this listing?', description: 'It is removed for everyone. Listings with bookings are archived instead so their records stay intact.', confirmLabel: 'Delete', tone: 'danger' }))) return
    startTransition(async () => {
      try {
        await hardDeleteServiceListing(id)
        router.push('/admin/service-listings')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete')
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
