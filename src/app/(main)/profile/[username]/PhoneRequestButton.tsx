'use client'

import { useState } from 'react'
import { requestPhoneAccess } from '@/actions/profile'
import { toast } from 'sonner'

export function PhoneRequestButton({ targetId }: { targetId: string }) {
  const [requested, setRequested] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRequest() {
    setLoading(true)
    const result = await requestPhoneAccess(targetId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Phone number request sent!')
      setRequested(true)
    }
    setLoading(false)
  }

  if (requested) {
    return <span className="text-[10px] text-yellow-400">Request sent</span>
  }

  return (
    <button
      onClick={handleRequest}
      disabled={loading}
      className="text-[10px] text-primary hover:text-primary/80 underline transition-colors"
    >
      {loading ? 'Requesting...' : 'Request number'}
    </button>
  )
}
