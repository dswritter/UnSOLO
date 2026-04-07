'use client'

import { useState } from 'react'
import { joinRoom } from '@/actions/chat'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function JoinRoomButton({ roomId, label = 'Join Community', navigateAfterJoin = true }: { roomId: string; label?: string; navigateAfterJoin?: boolean }) {
  const [joining, setJoining] = useState(false)
  const router = useRouter()

  async function handleJoin() {
    setJoining(true)
    const result = await joinRoom(roomId)
    if (result?.error) {
      toast.error(result.error)
      setJoining(false)
      return
    }
    if (navigateAfterJoin) {
      router.push(`/community/${roomId}`)
    }
    router.refresh()
  }

  return (
    <Button
      onClick={handleJoin}
      disabled={joining}
      className="bg-primary text-black font-bold hover:bg-primary/90 min-w-[140px]"
    >
      {joining ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Joining...
        </span>
      ) : (
        label
      )}
    </Button>
  )
}
