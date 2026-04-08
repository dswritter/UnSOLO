'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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

function flatIndexForGroup(groups: { authorId: string; group: StatusStripStory[] }[], groupIdx: number, storyIdx: number) {
  let acc = 0
  for (let i = 0; i < groupIdx; i++) acc += groups[i]!.group.length
  return acc + storyIdx
}

export function StatusStoriesBar({
  initialStories,
  currentUserId,
  seenStoryIds = [],
  generalRooms,
  addSlotAvatarUrl,
  existingActiveCount,
}: {
  initialStories: StatusStripStory[]
  currentUserId: string
  /** From DB — which stories this user already viewed (syncs across devices) */
  seenStoryIds?: string[]
  generalRooms: { id: string; name: string }[]
  addSlotAvatarUrl?: string | null
  existingActiveCount: number
}) {
  const router = useRouter()
  const [viewer, setViewer] = useState<{ playlist: StatusStripStory[]; initialIndex: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [viewTick, setViewTick] = useState(0)

  // Hydrate localStorage from server so ring state matches other devices / sessions
  useEffect(() => {
    if (seenStoryIds.length > 0) markStatusStoriesViewed(currentUserId, seenStoryIds)
  }, [currentUserId, seenStoryIds])

  const grouped = useMemo(() => {
    const arr = groupStoriesByAuthor(initialStories)
    arr.sort((a, b) => {
      const ownA = a.authorId === currentUserId
      const ownB = b.authorId === currentUserId
      if (ownA && !ownB) return -1
      if (!ownA && ownB) return 1
      const va = isStoryGroupFullyViewed(currentUserId, a.group, seenStoryIds)
      const vb = isStoryGroupFullyViewed(currentUserId, b.group, seenStoryIds)
      if (va === vb) return 0
      return va ? 1 : -1
    })
    return arr
  }, [initialStories, currentUserId, viewTick, seenStoryIds])

  const playlistFlat = useMemo(() => grouped.flatMap(g => g.group), [grouped])

  const ownGroupIndex = useMemo(() => grouped.findIndex(g => g.authorId === currentUserId), [grouped, currentUserId])
  const ownGroup = ownGroupIndex >= 0 ? grouped[ownGroupIndex] : null
  const hasOwnStories = !!ownGroup && ownGroup.group.length > 0
  const ownStoryCount = ownGroup?.group.length ?? 0

  const atStatusLimit = existingActiveCount >= 3

  const othersGrouped = useMemo(() => grouped.filter(g => g.authorId !== currentUserId), [grouped])

  useEffect(() => {
    const sb = createClient()
    const ch = sb
      .channel('home-status-stories')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'status_stories' },
        () => router.refresh(),
      )
      .subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [router])

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide items-end">
        {/* Single "Your status" slot: golden ring when you have posts; + adds more */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="relative">
            <button
              type="button"
              className="group relative"
              onClick={() => {
                if (hasOwnStories) {
                  const start = flatIndexForGroup(grouped, ownGroupIndex, 0)
                  setViewer({ playlist: playlistFlat, initialIndex: start })
                } else if (!atStatusLimit) {
                  setAddOpen(true)
                } else {
                  toast.message('You already have 3 active status photos')
                }
              }}
            >
              <div
                className={`relative h-16 w-16 rounded-full p-[2px] transition-colors ${
                  hasOwnStories
                    ? 'bg-gradient-to-tr from-primary via-amber-300 to-primary'
                    : 'border-2 border-dashed border-primary/60 group-hover:border-primary group-disabled:border-zinc-600'
                }`}
              >
                <Avatar className="h-full w-full border-2 border-background dark:border-black">
                  <AvatarImage src={addSlotAvatarUrl || ''} />
                  <AvatarFallback className="bg-muted text-primary text-lg font-bold">
                    <Plus className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                {hasOwnStories && ownStoryCount > 1 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-background text-foreground border-2 border-border dark:bg-zinc-900 dark:border-black dark:text-primary text-[10px] font-bold flex items-center justify-center z-[5]">
                    {ownStoryCount}
                  </span>
                ) : null}
              </div>
            </button>
            {!atStatusLimit ? (
              <button
                type="button"
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-black flex items-center justify-center border-2 border-border dark:border-black shadow-md z-10 hover:scale-105 active:scale-95 transition-transform"
                aria-label="Add status photos"
                onClick={e => {
                  e.stopPropagation()
                  setAddOpen(true)
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <span className="text-[10px] text-muted-foreground max-w-[4.5rem] truncate">Your status</span>
        </div>

        {othersGrouped.map(({ authorId, group }) => {
          const story = group[0]!
          const author = unwrapAuthor(story)
          const label = author?.full_name || author?.username || 'Traveler'
          const count = group.length
          const allViewed = isStoryGroupFullyViewed(currentUserId, group, seenStoryIds)
          const groupIdx = grouped.findIndex(g => g.authorId === authorId)
          return (
            <button
              key={authorId}
              type="button"
              onClick={() => {
                const start = flatIndexForGroup(grouped, groupIdx, 0)
                setViewer({ playlist: playlistFlat, initialIndex: start })
              }}
              className={`flex flex-col items-center gap-1.5 shrink-0 ${allViewed ? 'opacity-75' : ''}`}
            >
              <div className="relative">
                <div
                  className={`h-16 w-16 rounded-full p-[2px] transition-all ${
                    allViewed
                      ? 'bg-gradient-to-tr from-zinc-700 to-zinc-900 ring-2 ring-zinc-600 grayscale-[0.25]'
                      : 'bg-gradient-to-tr from-primary via-amber-300 to-primary'
                  }`}
                >
                  <Avatar className="h-full w-full border-2 border-background dark:border-black">
                    <AvatarImage src={author?.avatar_url || ''} />
                    <AvatarFallback className="bg-muted text-primary text-sm font-bold">
                      {getInitials(label)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {count > 1 ? (
                  <span
                    className={`absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full border-2 text-[10px] font-bold flex items-center justify-center z-[5] ${
                      allViewed
                        ? 'bg-muted border-border text-muted-foreground dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-400'
                        : 'bg-background border-border text-foreground dark:bg-zinc-900 dark:border-black dark:text-primary'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] text-foreground/90 max-w-[4.5rem] truncate">{label}</span>
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
          stories={viewer.playlist}
          initialIndex={viewer.initialIndex}
          currentUserId={currentUserId}
          onClose={() => {
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
