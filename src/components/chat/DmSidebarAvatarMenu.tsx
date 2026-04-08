'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Image as ImageIcon, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { StatusStripStory } from '@/actions/statusStories'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'
import { X } from 'lucide-react'

export function DmSidebarAvatarMenu({
  avatarUrl,
  fallbackName,
  username,
  userId,
  hasStatus,
  online,
  currentUserId,
}: {
  avatarUrl: string | null
  fallbackName: string
  username: string
  userId: string
  hasStatus: boolean
  online: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [picOpen, setPicOpen] = useState(false)
  const [statusStories, setStatusStories] = useState<StatusStripStory[] | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  const loadAndOpenStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const sb = createClient()
      const { data, error } = await sb
        .from('status_stories')
        .select('id, author_id, media_url, created_at, expires_at, author:profiles(username, full_name, avatar_url)')
        .eq('author_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(3)
      if (error || !data?.length) {
        toast.message('No status to show right now')
        return
      }
      setStatusStories(data as unknown as StatusStripStory[])
    } finally {
      setLoadingStatus(false)
    }
  }, [userId])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={e => e.stopPropagation()}
            >
              <Avatar className="h-11 w-11">
                <AvatarImage src={avatarUrl || ''} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                  {getInitials(fallbackName)}
                </AvatarFallback>
              </Avatar>
              {online && (
                <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
              )}
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[12rem] bg-card border-border z-[200]">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={e => {
              e.preventDefault()
              setPicOpen(true)
            }}
          >
            <ImageIcon className="h-4 w-4 mr-2" /> See profile picture
          </DropdownMenuItem>
          {hasStatus ? (
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={loadingStatus}
              onClick={e => {
                e.preventDefault()
                void loadAndOpenStatus()
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" /> View status
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {picOpen && avatarUrl ? (
        <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4" onClick={() => setPicOpen(false)}>
          <button
            type="button"
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            onClick={() => setPicOpen(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt="" className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      ) : null}

      {statusStories && statusStories.length > 0 ? (
        <StatusStoryViewer
          stories={statusStories}
          initialIndex={0}
          currentUserId={currentUserId}
          onClose={() => setStatusStories(null)}
          onDeleted={() => {
            setStatusStories(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
