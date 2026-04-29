'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { resubmitServiceListing } from '@/actions/host-service-listings'

interface Props {
  listingId: string
}

export function ResubmitServiceListingButton({ listingId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await resubmitServiceListing(listingId)
    setLoading(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Your listing is back in the admin review queue')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
    >
      {loading ? 'Resubmitting…' : 'Resubmit for admin review →'}
    </button>
  )
}
