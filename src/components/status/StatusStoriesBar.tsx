'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { StatusStripStory } from '@/actions/statusStories'
import { createStatusStories } from '@/actions/statusStories'
import type { StatusStoryAudienceMode } from '@/lib/statusStories/audience'
import { AddStatusStorySheet } from '@/components/status/AddStatusStorySheet'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'
import { isStoryGroupFullyViewed, markStatusStoriesViewed } from '@/lib/statusStories/viewed'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'

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

/** Golden ring progress overlay while status photos upload in the background */
function StatusRingProgress({ progress }: { progress: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const dash = c * (1 - progress / 100)
  return (
    <svg
      className="absolute -inset-[3px] z-[4] h-[calc(100%+6px)] w-[calc(100%+6px)] pointer-events-none -rotate-90"
      viewBox="0 0 72 72"
      aria-hidden
    >
      <circle cx="36" cy="36" r={r} fill="none" className="stroke-muted-foreground/40" strokeWidth="3" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dash}
      />
    </svg>
  )
}

export function StatusStoriesBar({
  initialStories,
  currentUserId,
  seenStoryIds = [],
  generalRooms,
  addSlotAvatarUrl,
  existingActiveCount,
  /** Cap how many *other* authors appear before "View all" (Wander home layout). */
  maxOtherAuthors,
  /** Smaller rings and tighter spacing (e.g. /wander) */
  compact = false,
}: {
  initialStories: StatusStripStory[]
  currentUserId: string
  /** From DB — which stories this user already viewed (syncs across devices) */
  seenStoryIds?: string[]
  generalRooms: { id: string; name: string }[]
  addSlotAvatarUrl?: string | null
  existingActiveCount: number
  maxOtherAuthors?: number
  compact?: boolean
}) {
  const ring = compact ? 'h-12 w-12' : 'h-16 w-16'
  const labelCls = compact ? 'text-[9px]' : 'text-[10px]'
  const fabCls = compact ? 'h-5 w-5' : 'h-7 w-7'
  const plusIco = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const gap = compact ? 'gap-2' : 'gap-4'
  const rowPad = compact ? 'py-0.5' : 'pt-2.5'
  const rowEndPad = compact ? 'pe-2' : ''
  const router = useRouter()
  const [viewer, setViewer] = useState<{ playlist: StatusStripStory[]; initialIndex: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [viewTick, setViewTick] = useState(0)
  const [showAllOthers, setShowAllOthers] = useState(false)
  /** 0–100 while uploading in background; null when idle */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  const handleBackgroundShare = useCallback(
    async (payload: {
      files: File[]
      mode: StatusStoryAudienceMode
      excludeUsernames?: string
      includeUsernames?: string
      includeRoomIds?: string[]
    }) => {
      const { files, mode, excludeUsernames, includeUsernames, includeRoomIds } = payload
      const totalSteps = files.length + 1
      setUploadProgress(0)
      try {
        const urls: string[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!
          if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
            toast.error(UPLOAD_IMAGE_TOO_LARGE_MESSAGE)
            setUploadProgress(null)
            return
          }
          const fd = new FormData()
          fd.append('file', file)
          fd.append('purpose', 'status_story')
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          const j = (await res.json()) as { url?: string; error?: string }
          if (!res.ok || !j.url) {
            toast.error(j.error || 'Upload failed')
            setUploadProgress(null)
            return
          }
          urls.push(j.url)
          setUploadProgress(Math.min(99, Math.round(((i + 1) / totalSteps) * 100)))
        }
        const r = await createStatusStories({
          mediaUrls: urls,
          mode,
          excludeUsernames,
          includeUsernames,
          includeRoomIds,
        })
        if (r.error) {
          toast.error(r.error)
          setUploadProgress(null)
          return
        }
        setUploadProgress(100)
        toast.success('Shared')
        router.refresh()
      } finally {
        window.setTimeout(() => setUploadProgress(null), 600)
      }
    },
    [router],
  )

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
      if (va !== vb) return va ? 1 : -1
      const ta = new Date(a.group[0]!.created_at).getTime()
      const tb = new Date(b.group[0]!.created_at).getTime()
      return tb - ta
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

  const othersForStrip = useMemo(() => {
    if (maxOtherAuthors == null || showAllOthers) return othersGrouped
    return othersGrouped.slice(0, maxOtherAuthors)
  }, [othersGrouped, maxOtherAuthors, showAllOthers])

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
      <div
        className={`flex ${gap} overflow-x-auto overflow-y-visible pb-0.5 ${rowPad} scrollbar-hide items-center ${rowEndPad}`}
      >
        {/* Single "Your status" slot: golden ring when you have posts; + adds more */}
        <div className="flex flex-col items-center gap-1 sm:gap-1.5 shrink-0">
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
                className={`relative ${ring} rounded-full p-[2px] transition-colors ${
                  hasOwnStories
                    ? 'bg-gradient-to-tr from-primary via-amber-300 to-primary'
                    : 'border-2 border-dashed border-primary/60 group-hover:border-primary group-disabled:border-zinc-600'
                }`}
              >
                {uploadProgress !== null ? <StatusRingProgress progress={uploadProgress} /> : null}
                <Avatar className="h-full w-full border-2 border-background dark:border-black">
                  <AvatarImage src={addSlotAvatarUrl || ''} />
                  <AvatarFallback className="bg-muted text-primary text-lg font-bold">
                    <Plus className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
                  </AvatarFallback>
                </Avatar>
                {hasOwnStories && ownStoryCount > 1 ? (
                  <span
                    className={`absolute -top-0.5 -right-0.5 min-w-[1.15rem] rounded-full bg-background text-foreground border-2 border-border dark:bg-zinc-900 dark:border-black dark:text-primary font-bold flex items-center justify-center z-[5] ${
                      compact ? 'h-4 px-0.5 text-[9px]' : 'h-5 px-1 text-[10px]'
                    }`}
                  >
                    {ownStoryCount}
                  </span>
                ) : null}
              </div>
            </button>
            {!atStatusLimit ? (
              <button
                type="button"
                className={`absolute bottom-0 right-0 rounded-full bg-primary text-black flex items-center justify-center border-2 border-border dark:border-black shadow-md z-10 hover:scale-105 active:scale-95 transition-transform ${fabCls}`}
                aria-label="Add status photos"
                onClick={e => {
                  e.stopPropagation()
                  setAddOpen(true)
                }}
              >
                <Plus className={plusIco} />
              </button>
            ) : null}
          </div>
          <span className={`${labelCls} text-muted-foreground max-w-[4.5rem] truncate`}>Your status</span>
        </div>

        {othersForStrip.map(({ authorId, group }) => {
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
              className={`flex flex-col items-center gap-1 sm:gap-1.5 shrink-0 ${allViewed ? 'opacity-75' : ''}`}
            >
              <div className="relative">
                <div
                  className={`${ring} rounded-full p-[2px] transition-all ${
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
                    className={`absolute -top-0.5 -right-0.5 min-w-[1.1rem] rounded-full border-2 font-bold flex items-center justify-center z-[5] ${
                      compact ? 'h-4 px-0.5 text-[9px]' : 'h-5 min-w-[1.25rem] px-1 text-[10px]'
                    } ${
                      allViewed
                        ? 'bg-muted border-border text-muted-foreground dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-400'
                        : 'bg-background border-border text-foreground dark:bg-zinc-900 dark:border-black dark:text-primary'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </div>
              <span className={`${labelCls} text-foreground/90 max-w-[4.5rem] truncate`}>{label}</span>
            </button>
          )
        })}

        {maxOtherAuthors != null &&
        !showAllOthers &&
        othersGrouped.length > maxOtherAuthors ? (
          <button
            type="button"
            onClick={() => setShowAllOthers(true)}
            className="flex flex-col items-center gap-1 sm:gap-1.5 shrink-0 self-start pt-0.5"
          >
            <div
              className={`${ring} rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center font-semibold text-primary px-1 text-center leading-tight bg-background/50 hover:bg-primary/10 transition-colors ${
                compact ? 'text-[9px]' : 'text-[11px]'
              }`}
            >
              View all
            </div>
            <span className={`${labelCls} text-muted-foreground`}>Stories</span>
          </button>
        ) : null}
        {maxOtherAuthors != null && showAllOthers && othersGrouped.length > maxOtherAuthors ? (
          <button
            type="button"
            onClick={() => setShowAllOthers(false)}
            className="text-[11px] font-medium text-primary hover:underline shrink-0 self-center"
          >
            Show less
          </button>
        ) : null}
      </div>

      <AddStatusStorySheet
        open={addOpen}
        onOpenChange={setAddOpen}
        generalRooms={generalRooms}
        existingActiveCount={existingActiveCount}
        onShareAsync={handleBackgroundShare}
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
