'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserPlus, UserMinus, MessageCircle } from 'lucide-react'
import { followUser, unfollowUser, startDirectMessage } from '@/actions/profile'
import { toast } from 'sonner'

interface ProfileActionsProps {
  profileId: string
  isFollowing: boolean
  isLoggedIn: boolean
}

export function ProfileActions({ profileId, isFollowing: initialFollowing, isLoggedIn }: ProfileActionsProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleFollow() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    if (following) {
      const result = await unfollowUser(profileId)
      if (result.error) toast.error(result.error)
      else setFollowing(false)
    } else {
      const result = await followUser(profileId)
      if (result.error) toast.error(result.error)
      else {
        setFollowing(true)
        toast.success('Following!')
      }
    }
    setLoading(false)
  }

  async function handleDM() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    const result = await startDirectMessage(profileId)
    if (result.error) {
      toast.error(result.error)
    } else if (result.roomId) {
      router.push(`/chat/${result.roomId}`)
    }
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      <Button
        variant={following ? 'outline' : 'default'}
        size="sm"
        className={following ? 'border-border' : 'bg-primary text-black hover:bg-primary/90'}
        onClick={handleFollow}
        disabled={loading}
      >
        {following ? <><UserMinus className="h-3.5 w-3.5 mr-1" /> Unfollow</> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Follow</>}
      </Button>
      <Button variant="outline" size="sm" className="border-border" onClick={handleDM} disabled={loading}>
        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message
      </Button>
    </div>
  )
}
