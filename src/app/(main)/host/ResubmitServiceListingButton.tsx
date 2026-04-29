'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { resubmitServiceListing } from '@/actions/host-service-listings'
import { HostSubmittingOverlay } from '@/components/host/HostSubmittingOverlay'
import { cn } from '@/lib/utils'

interface Props {
  listingId: string
  /** When false, onClick explains that edits are required first. */
  allowResubmit?: boolean
}

export function ResubmitServiceListingButton({ listingId, allowResubmit = true }: Props) {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const cancelledRef = useRef(false)

  async function handleClick() {
    if (!allowResubmit) {
      toast.message('Save changes to your listing or items before resubmitting.')
      return
    }
    cancelledRef.current = false
    setLoading(true)
    setOverlayOpen(true)
    try {
      const result = await resubmitServiceListing(listingId)
      if (cancelledRef.current) {
        if (!('error' in result && result.error)) {
          toast.success('Your listing was submitted for review.')
          window.location.assign('/host')
        }
        return
      }
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Your listing is back in the admin review queue')
      window.location.assign('/host')
    } finally {
      setLoading(false)
      setOverlayOpen(false)
    }
  }

  function handleCancelOverlay() {
    cancelledRef.current = true
    setOverlayOpen(false)
  }

  return (
    <>
      <HostSubmittingOverlay
        open={overlayOpen}
        message="Submitting…"
        onCancel={handleCancelOverlay}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={
          allowResubmit
            ? undefined
            : 'Edit and save your listing or items before resubmitting again.'
        }
        className={cn(
          'text-xs font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed',
          allowResubmit ? 'text-primary' : 'text-primary/60',
        )}
      >
        {loading ? 'Resubmitting…' : 'Resubmit for admin review →'}
      </button>
    </>
  )
}
