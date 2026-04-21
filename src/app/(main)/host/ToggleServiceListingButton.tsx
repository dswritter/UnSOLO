'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { toggleHostServiceListingActive } from '@/actions/host-service-listings'

interface Props {
  listingId: string
  isActive: boolean
}

export function ToggleServiceListingButton({ listingId, isActive }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(isActive)

  async function handleToggle() {
    setLoading(true)
    const result = await toggleHostServiceListingActive(listingId)
    setLoading(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    const next = result.isActive ?? !active
    setActive(next)
    toast.success(next ? 'Listing is now visible to travelers' : 'Listing hidden from travelers')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      title={active ? 'Hide listing' : 'Show listing'}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
    >
      {active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  )
}
