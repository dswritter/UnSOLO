'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { StatusStripStory } from '@/actions/statusStories'
import { AddStatusStorySheet } from '@/components/status/AddStatusStorySheet'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'

export function ProfileStatusStories({
  stories,
  isOwn,
  generalRooms,
  viewerId,
}: {
  stories: StatusStripStory[]
  isOwn: boolean
  generalRooms: { id: string; name: string }[]
  viewerId: string
}) {
  const router = useRouter()
  const [viewerStory, setViewerStory] = useState<StatusStripStory | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {isOwn ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className="h-14 w-14 rounded-lg border-2 border-dashed border-primary/50 flex items-center justify-center hover:border-primary transition-colors">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground">Add</span>
          </button>
        ) : null}

        {stories.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setViewerStory(s)}
            className="shrink-0 flex flex-col items-center gap-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.media_url}
              alt=""
              className="h-14 w-14 rounded-lg object-cover border border-border hover:ring-2 hover:ring-primary/40 transition-all"
            />
            <span className="text-[10px] text-muted-foreground">View</span>
          </button>
        ))}
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
          currentUserId={viewerId}
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
