'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { StatusStripStory } from '@/actions/statusStories'
import { AddStatusStorySheet } from '@/components/status/AddStatusStorySheet'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'

function unwrapAuthor(story: StatusStripStory) {
  const a = story.author as { username: string; full_name: string | null; avatar_url: string | null } | null | undefined
  if (!a) return null
  return Array.isArray(a) ? a[0] ?? null : a
}

export function StatusStoriesBar({
  initialStories,
  currentUserId,
  generalRooms,
  addSlotAvatarUrl,
}: {
  initialStories: StatusStripStory[]
  currentUserId: string
  generalRooms: { id: string; name: string }[]
  addSlotAvatarUrl?: string | null
}) {
  const router = useRouter()
  const [viewerStory, setViewerStory] = useState<StatusStripStory | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide items-end">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div className="relative h-16 w-16 rounded-full p-[2px] border-2 border-dashed border-primary/60 group-hover:border-primary transition-colors">
            <Avatar className="h-full w-full border-2 border-black">
              <AvatarImage src={addSlotAvatarUrl || ''} />
              <AvatarFallback className="bg-zinc-800 text-primary text-lg font-bold">
                <Plus className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-5 w-5 rounded-full bg-primary text-black flex items-center justify-center border-2 border-black">
              <Plus className="h-3 w-3" />
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 max-w-[4.5rem] truncate">Your status</span>
        </button>

        {initialStories.map(story => {
          const author = unwrapAuthor(story)
          const label = author?.full_name || author?.username || 'Traveler'
          const isOwn = story.author_id === currentUserId
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => setViewerStory(story)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div
                className={`h-16 w-16 rounded-full p-[2.5px] ${
                  isOwn
                    ? 'bg-gradient-to-tr from-primary via-amber-300 to-primary'
                    : 'bg-gradient-to-tr from-primary/80 to-zinc-500'
                }`}
              >
                <Avatar className="h-full w-full border-2 border-black">
                  <AvatarImage src={author?.avatar_url || ''} />
                  <AvatarFallback className="bg-zinc-800 text-primary text-sm font-bold">
                    {getInitials(label)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[10px] text-zinc-300 max-w-[4.5rem] truncate">{isOwn ? 'You' : label}</span>
            </button>
          )
        })}
      </div>

      <AddStatusStorySheet
        open={addOpen}
        onOpenChange={setAddOpen}
        generalRooms={generalRooms}
        onCreated={() => {
          setAddOpen(false)
          router.refresh()
        }}
      />

      {viewerStory ? (
        <StatusStoryViewer
          story={viewerStory}
          currentUserId={currentUserId}
          onClose={() => setViewerStory(null)}
          onDeleted={() => {
            setViewerStory(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
