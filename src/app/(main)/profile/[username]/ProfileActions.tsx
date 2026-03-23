'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserPlus, UserMinus, MessageCircle, X } from 'lucide-react'
import { followUser, unfollowUser, startDirectMessage } from '@/actions/profile'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

type FollowUser = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
}

interface ProfileActionsProps {
  profileId: string
  isFollowing: boolean
  isLoggedIn: boolean
  initialFollowersCount: number
  initialFollowingCount: number
  followers: FollowUser[]
  following: FollowUser[]
}

export function ProfileActions({
  profileId,
  isFollowing: initialFollowing,
  isLoggedIn,
  initialFollowersCount,
  initialFollowingCount,
  followers,
  following,
}: ProfileActionsProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [followersCount, setFollowersCount] = useState(initialFollowersCount)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState<'followers' | 'following' | null>(null)
  const router = useRouter()

  async function handleFollow() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    if (isFollowing) {
      // Optimistic
      setIsFollowing(false)
      setFollowersCount(c => c - 1)
      const result = await unfollowUser(profileId)
      if (result.error) {
        toast.error(result.error)
        setIsFollowing(true)
        setFollowersCount(c => c + 1)
      }
    } else {
      // Optimistic
      setIsFollowing(true)
      setFollowersCount(c => c + 1)
      const result = await followUser(profileId)
      if (result.error) {
        toast.error(result.error)
        setIsFollowing(false)
        setFollowersCount(c => c - 1)
      } else {
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
    <>
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant={isFollowing ? 'outline' : 'default'}
          size="sm"
          className={isFollowing ? 'border-border' : 'bg-primary text-black hover:bg-primary/90'}
          onClick={handleFollow}
          disabled={loading}
        >
          {isFollowing ? <><UserMinus className="h-3.5 w-3.5 mr-1" /> Unfollow</> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Follow</>}
        </Button>
        <Button variant="outline" size="sm" className="border-border" onClick={handleDM} disabled={loading}>
          <MessageCircle className="h-3.5 w-3.5 mr-1" /> Message
        </Button>
      </div>

      {/* Followers / Following counts (clickable) */}
      <div className="flex gap-4 mb-3 text-sm">
        <button onClick={() => setShowModal('followers')} className="hover:text-primary transition-colors">
          <strong className="text-white">{followersCount}</strong> <span className="text-muted-foreground">followers</span>
        </button>
        <button onClick={() => setShowModal('following')} className="hover:text-primary transition-colors">
          <strong className="text-white">{initialFollowingCount}</strong> <span className="text-muted-foreground">following</span>
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowModal(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-bold text-sm capitalize">{showModal}</h3>
              <button onClick={() => setShowModal(null)} className="text-muted-foreground hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-80 overflow-y-auto">
              {(showModal === 'followers' ? followers : following).length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No {showModal} yet
                </div>
              ) : (
                (showModal === 'followers' ? followers : following).map((user) => (
                  <Link
                    key={user.id}
                    href={`/profile/${user.username}`}
                    onClick={() => setShowModal(null)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {getInitials(user.full_name || user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{user.full_name || user.username}</div>
                      <div className="text-xs text-muted-foreground">@{user.username}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* For own profile — just shows clickable counts + modal, no follow/DM */
export function OwnProfileFollowCounts({
  followersCount,
  followingCount,
  followers,
  following,
}: {
  followersCount: number
  followingCount: number
  followers: FollowUser[]
  following: FollowUser[]
}) {
  const [showModal, setShowModal] = useState<'followers' | 'following' | null>(null)

  return (
    <>
      <div className="flex gap-4 mb-3 text-sm">
        <button onClick={() => setShowModal('followers')} className="hover:text-primary transition-colors">
          <strong className="text-white">{followersCount}</strong> <span className="text-muted-foreground">followers</span>
        </button>
        <button onClick={() => setShowModal('following')} className="hover:text-primary transition-colors">
          <strong className="text-white">{followingCount}</strong> <span className="text-muted-foreground">following</span>
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowModal(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-bold text-sm capitalize">{showModal}</h3>
              <button onClick={() => setShowModal(null)} className="text-muted-foreground hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(showModal === 'followers' ? followers : following).length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No {showModal} yet
                </div>
              ) : (
                (showModal === 'followers' ? followers : following).map((user) => (
                  <Link
                    key={user.id}
                    href={`/profile/${user.username}`}
                    onClick={() => setShowModal(null)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {getInitials(user.full_name || user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{user.full_name || user.username}</div>
                      <div className="text-xs text-muted-foreground">@{user.username}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
