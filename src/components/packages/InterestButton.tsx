'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { toggleInterest } from '@/actions/booking'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface InterestButtonProps {
  packageId: string
  initialCount: number
  initialInterested: boolean
  isLoggedIn: boolean
}

export function InterestButton({ packageId, initialCount, initialInterested, isLoggedIn }: InterestButtonProps) {
  const [interested, setInterested] = useState(initialInterested)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    // Optimistic
    const wasInterested = interested
    setInterested(!wasInterested)
    setCount(c => wasInterested ? c - 1 : c + 1)

    const result = await toggleInterest(packageId)
    if (result.error) {
      toast.error(result.error)
      setInterested(wasInterested)
      setCount(c => wasInterested ? c + 1 : c - 1)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
          interested
            ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
            : 'bg-secondary border-border text-muted-foreground hover:text-white hover:border-primary/40'
        }`}
      >
        <Heart className={`h-4 w-4 transition-all ${interested ? 'fill-red-400 text-red-400' : ''}`} />
        <span>{interested ? 'Interested' : "I'm Interested"}</span>
        {count > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${interested ? 'bg-red-500/20' : 'bg-secondary'}`}>
            {count}
          </span>
        )}
      </button>
      {count > 0 && (
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'person is' : 'people are'} interested
        </span>
      )}
    </div>
  )
}
