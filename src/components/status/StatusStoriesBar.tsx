'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { StatusStripStory } from '@/actions/statusStories'
import { AddStatusStorySheet } from '@/components/status/AddStatusStorySheet'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'
import { isStoryGroupFullyViewed, markStatusStoriesViewed } from '@/lib/statusStories/viewed'

function unwrapAuthor(story: StatusStripStory) {
  const a = story.author as { username: string; full_name: string | null; avatar_url: string | null } | null | undefined
  if (!a) return null
  return Array.isArray(a) ? a[0] ?? null : a
}

/** One ring per author; stories ordered newest-first within each group. */
function groupStoriesByAuthor(stories: StatusStripStory[]): { authorId: string; group: StatusStripStory[] }[] {
  const byAuthor = new Map<string, StatusStripStory[]>()
  const order: string[] = []
  for (const s of stories) {
    if (!byAuthor.has(s.author_id)) {
      byAuthor.set(s.author_id, [])
      order.push(s.author_id)
    }
    byAuthor.get(s.author_id)!.push(s)
  }
  for (const arr of byAuthor.values()) {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
  return order.map(authorId => ({ authorId, group: byAuthor.get(authorId)! }))
}

export function StatusStoriesBar({
  initialStories,
  currentUserId,
  generalRooms,
  addSlotAvatarUrl,
  existingActiveCount,
}: {
  initialStories: StatusStripStory[]
  currentUserId: string
  generalRooms: { id: string; name: string }[]
  addSlotAvatarUrl?: string | null
  existingActiveCount: number
}) {
  const router = useRouter()
  const [viewer, setViewer] = useState<{ stories: StatusStripStory[]; initialIndex: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [viewTick, setViewTick] = useState(0)

  const grouped = useMemo(() => {
    const arr = groupStoriesByAuthor(initialStories)
    arr.sort((a, b) => {
      const ownA = a.authorId === currentUserId
      const ownB = b.authorId === currentUserId
      if (ownA && !ownB) return -1
      if (!ownA && ownB) return 1
      const va = isStoryGroupFullyViewed(currentUserId, a.group)
      const vb = isStoryGroupFullyViewed(currentUserId, b.group)
      if (va === vb) return 0
      return va ? 1 : -1
    })
    return arr
  }, [initialStories, currentUserId, viewTick])
  const atStatusLimit = existingActiveCount >= 3

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide items-end">
        <button
          type="button"
          disabled={atStatusLimit}
          title={atStatusLimit ? 'You already have 3 active status photos' : 'Add status'}
          onClick={() => {
            if (atStatusLimit) {
              toast.message('You already have 3 active status photos')
              return
            }
            setAddOpen(true)
          }}
          className="flex flex-col items-center gap-1.5 shrink-0 group disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="relative h-16 w-16 rounded-full p-[2px] border-2 border-dashed border-primary/60 group-hover:border-primary transition-colors group-disabled:border-zinc-600">
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

        {grouped.map(({ authorId, group }) => {
          const story = group[0]!
          const author = unwrapAuthor(story)
          const label = author?.full_name || author?.username || 'Traveler'
          const isOwn = authorId === currentUserId
          const count = group.length
          const allViewed = isStoryGroupFullyViewed(currentUserId, group)
          return (
            <button
              key={authorId}
              type="button"
              onClick={() => setViewer({ stories: group, initialIndex: 0 })}
              className={`flex flex-col items-center gap-1.5 shrink-0 ${allViewed ? 'opacity-50' : ''}`}
            >
              <div className="relative">
                <div
                  className={`h-16 w-16 rounded-full p-[2.5px] transition-opacity ${
                    isOwn
                      ? 'bg-gradient-to-tr from-primary via-amber-300 to-primary'
                      : 'bg-gradient-to-tr from-primary/80 to-zinc-500'
                  } ${allViewed ? 'grayscale-[0.35]' : ''}`}
                >
                  <Avatar className="h-full w-full border-2 border-black">
                    <AvatarImage src={author?.avatar_url || ''} />
                    <AvatarFallback className="bg-zinc-800 text-primary text-sm font-bold">
                      {getInitials(label)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {count > 1 ? (
                  <span className="absolute -bottom-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-zinc-900 border-2 border-black text-[10px] font-bold text-primary flex items-center justify-center">
                    {count}
                  </span>
                ) : null}
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
        existingActiveCount={existingActiveCount}
        onCreated={() => {
          setAddOpen(false)
          router.refresh()
        }}
      />

      {viewer ? (
        <StatusStoryViewer
          stories={viewer.stories}
          initialIndex={viewer.initialIndex}
          currentUserId={currentUserId}
          onClose={() => {
            const authorId = viewer.stories[0]?.author_id
            if (authorId && authorId !== currentUserId) {
              markStatusStoriesViewed(currentUserId, viewer.stories.map(s => s.id))
            }
            setViewTick(t => t + 1)
            setViewer(null)
          }}
          onDeleted={() => {
            setViewer(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
