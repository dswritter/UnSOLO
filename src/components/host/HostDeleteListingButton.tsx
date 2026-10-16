'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConfirmProvider, useConfirm } from '@/components/admin/ui/ConfirmDialog'
import { deleteMyHostedTrip, deleteMyServiceListing } from '@/actions/host-listing-delete'

type Props = { kind: 'trip' | 'service'; listingId: string; title: string; className?: string; onDeleted?: () => void }

export function HostDeleteListingButton(props: Props) {
  return <ConfirmProvider><DeleteButton {...props} /></ConfirmProvider>
}

function DeleteButton({ kind, listingId, title, className, onDeleted }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete “${title}”?`,
      description: 'It disappears from your dashboard and from travellers. Listings with past bookings are archived so their records are kept. Running listings or ones with upcoming bookings can’t be deleted.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const result = kind === 'trip' ? await deleteMyHostedTrip(listingId) : await deleteMyServiceListing(listingId)
    setBusy(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success(result.archived ? 'Listing archived' : 'Listing deleted')
    onDeleted?.()
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={busy}
      title="Delete listing"
      aria-label={`Delete ${title}`}
      className={cn('rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40', className)}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
