'use client'

import { useState, useTransition } from 'react'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/hosting'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getInitials, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Check,
  X,
  Clock,
  MapPin,
  MessageSquare,
  Trophy,
  UserCheck,
  UserX,
} from 'lucide-react'

interface JoinRequest {
  id: string
  trip_id: string
  user_id: string
  status: string
  message: string | null
  host_response: string | null
  created_at: string
  updated_at: string
  trips_completed: number
  total_score: number
  user: {
    id: string
    username: string
    full_name: string | null
    avatar_url: string | null
    bio: string | null
    location: string | null
    date_of_birth: string | null
  } | null
}

interface Props {
  tripId: string
  pendingRequests: JoinRequest[]
  otherRequests: JoinRequest[]
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-900/50 text-green-300 border border-green-700 text-xs gap-1">
          <UserCheck className="h-3 w-3" /> Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs gap-1">
          <UserX className="h-3 w-3" /> Rejected
        </Badge>
      )
    case 'pending':
      return (
        <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-xs gap-1">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      )
    default:
      return <Badge className="bg-zinc-700 text-zinc-200 text-xs">{status}</Badge>
  }
}

function RequestCard({
  request,
  showActions,
}: {
  request: JoinRequest
  showActions: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [handled, setHandled] = useState(false)
  const [handledStatus, setHandledStatus] = useState<string | null>(null)

  const user = request.user

  function handleApprove() {
    startTransition(async () => {
      const result = await approveJoinRequest(request.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Approved ${user?.full_name || user?.username || 'request'}`)
        setHandled(true)
        setHandledStatus('approved')
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectJoinRequest(request.id, rejectReason || undefined)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Rejected ${user?.full_name || user?.username || 'request'}`)
        setHandled(true)
        setHandledStatus('rejected')
        setShowRejectInput(false)
      }
    })
  }

  if (handled) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4 opacity-60">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={user?.avatar_url || ''} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(user?.full_name || user?.username || '?')}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user?.full_name || user?.username}</p>
            <StatusBadge status={handledStatus!} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* User Info */}
        <Avatar className="h-12 w-12 border border-border shrink-0">
          <AvatarImage src={user?.avatar_url || ''} />
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
            {getInitials(user?.full_name || user?.username || '?')}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold">{user?.full_name || user?.username || 'Unknown User'}</p>
            {user?.username && (
              <span className="text-xs text-muted-foreground">@{user.username}</span>
            )}
            {!showActions && <StatusBadge status={request.status} />}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
            {user?.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {user.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Trophy className="h-3 w-3" /> {request.trips_completed} trips completed
            </span>
            <span>Score: {request.total_score}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(request.created_at)}
            </span>
          </div>

          {user?.bio && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{user.bio}</p>
          )}

          {request.message && (
            <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Their message:
              </p>
              <p className="text-sm">{request.message}</p>
            </div>
          )}

          {request.host_response && request.status === 'rejected' && (
            <div className="mt-2 p-3 rounded-lg bg-red-900/10 border border-red-900/30">
              <p className="text-xs text-red-300 mb-1">Your response:</p>
              <p className="text-sm text-red-200">{request.host_response}</p>
            </div>
          )}

          {/* Action Buttons */}
          {showActions && (
            <div className="mt-4">
              {!showRejectInput ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={isPending}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRejectInput(true)}
                    disabled={isPending}
                    className="text-red-400 border-red-900/50 hover:bg-red-900/20 gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (optional)"
                    className="bg-secondary border-border text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleReject}
                      disabled={isPending}
                      className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" />
                      Confirm Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowRejectInput(false)
                        setRejectReason('')
                      }}
                      className="text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ManageRequestsClient({ tripId, pendingRequests, otherRequests }: Props) {
  return (
    <div className="space-y-8">
      {/* Pending Requests */}
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-400" />
          Pending Requests
          {pendingRequests.length > 0 && (
            <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-xs">
              {pendingRequests.length}
            </Badge>
          )}
        </h2>

        {pendingRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No pending requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map(req => (
              <RequestCard key={req.id} request={req} showActions={true} />
            ))}
          </div>
        )}
      </div>

      {/* Approved / Rejected */}
      {otherRequests.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-400" />
            Processed Requests
            <Badge variant="secondary" className="text-xs">
              {otherRequests.length}
            </Badge>
          </h2>

          <div className="space-y-4">
            {otherRequests.map(req => (
              <RequestCard key={req.id} request={req} showActions={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
