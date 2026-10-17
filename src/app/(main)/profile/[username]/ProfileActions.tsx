'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserPlus, UserMinus, MessageCircle, X } from 'lucide-react'
import { followUser, unfollowUser, startDirectMessage, getFollowList, type FollowListUser } from '@/actions/profile'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { useFollowersCount } from './FollowersCountContext'

interface ProfileActionsProps {
  profileId: string
  isFollowing: boolean
  isLoggedIn: boolean
}

export function ProfileActions({
  profileId,
  isFollowing: initialFollowing,
  isLoggedIn,
}: ProfileActionsProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  // Populated when rendered alongside OwnProfileFollowCounts (see FollowersCountContext) —
  // lets this button's optimistic toggle update that count instantly.
  const followersCountCtx = useFollowersCount()

  async function handleFollow() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    if (isFollowing) {
      setIsFollowing(false)
      followersCountCtx?.setCount(c => c - 1)
      const result = await unfollowUser(profileId)
      if (result.error) {
        toast.error(result.error)
        setIsFollowing(true)
        followersCountCtx?.setCount(c => c + 1)
      }
    } else {
      setIsFollowing(true)
      followersCountCtx?.setCount(c => c + 1)
      const result = await followUser(profileId)
      if (result.error) {
        toast.error(result.error)
        setIsFollowing(false)
        followersCountCtx?.setCount(c => c - 1)
      } else {
        toast.success('Following!')
      }
    }
    setLoading(false)
    router.refresh()
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
      router.push(`/community/${result.roomId}`)
    }
    setLoading(false)
  }

  return (
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
  )
}

type FollowKind = 'followers' | 'following'

/* Follow counts with an on-demand list modal — used for own and other profiles. */
export function OwnProfileFollowCounts({
  profileId,
  followersCount,
  followingCount,
}: {
  profileId: string
  followersCount: number
  followingCount: number
}) {
  const [showModal, setShowModal] = useState<FollowKind | null>(null)
  const [lists, setLists] = useState<Partial<Record<FollowKind, FollowListUser[]>>>({})
  const [loadingKind, setLoadingKind] = useState<FollowKind | null>(null)
  // Shares the Follow button's optimistic count when rendered inside FollowersCountProvider.
  const followersCountCtx = useFollowersCount()
  const displayFollowersCount = followersCountCtx?.count ?? followersCount

  async function open(kind: FollowKind) {
    setShowModal(kind)
    if (lists[kind]) return
    setLoadingKind(kind)
    try {
      const users = await getFollowList(profileId, kind)
      setLists(prev => ({ ...prev, [kind]: users }))
    } catch {
      toast.error('Could not load the list')
    } finally {
      setLoadingKind(null)
    }
  }

  const users = showModal ? lists[showModal] : undefined

  return (
    <>
      <div className="flex gap-4 mb-3 text-sm">
        <button type="button" onClick={() => void open('followers')} className="hover:text-primary transition-colors">
          <strong className="text-foreground">{displayFollowersCount}</strong> <span className="text-muted-foreground">followers</span>
        </button>
        <button type="button" onClick={() => void open('following')} className="hover:text-primary transition-colors">
          <strong className="text-foreground">{followingCount}</strong> <span className="text-muted-foreground">following</span>
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowModal(null)}>
          <div role="dialog" aria-modal="true" aria-label={showModal} className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-bold text-sm capitalize">{showModal}</h3>
              <button type="button" onClick={() => setShowModal(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!users && loadingKind === showModal ? (
                <div className="flex justify-center px-4 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
                </div>
              ) : !users || users.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No {showModal} yet
                </div>
              ) : (
                users.map((user) => (
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
