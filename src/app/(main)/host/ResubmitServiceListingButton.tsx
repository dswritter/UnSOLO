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
    toast.success('Listing resubmitted for review')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs text-amber-500 hover:underline disabled:opacity-50"
    >
      {loading ? 'Resubmitting…' : 'Resubmit for review →'}
    </button>
  )
}
