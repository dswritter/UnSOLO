'use client'

import { useState, useCallback } from 'react'
import { X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StatusStripStory } from '@/actions/statusStories'
import { deleteStatusStory } from '@/actions/statusStories'
import { toast } from 'sonner'

function unwrapAuthor(story: StatusStripStory) {
  const a = story.author as { username: string; full_name: string | null } | null | undefined
  if (!a) return null
  return Array.isArray(a) ? a[0] ?? null : a
}

export function StatusStoryViewer({
  stories: initialStories,
  initialIndex = 0,
  currentUserId,
  onClose,
  onDeleted,
}: {
  stories: StatusStripStory[]
  initialIndex?: number
  currentUserId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [list, setList] = useState<StatusStripStory[]>(initialStories)
  const [idx, setIdx] = useState(() => Math.min(initialIndex, Math.max(0, initialStories.length - 1)))

  const story = list[idx]
  const author = story ? unwrapAuthor(story) : null
  const isOwn = story?.author_id === currentUserId

  const goPrev = useCallback(() => setIdx(i => (i > 0 ? i - 1 : i)), [])
  const goNext = useCallback(() => setIdx(i => (i < list.length - 1 ? i + 1 : i)), [list.length])

  async function onDelete() {
    if (!story) return
    if (!window.confirm('Delete this photo from your status?')) return
    const r = await deleteStatusStory(story.id)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success('Removed')
    const nl = list.filter(s => s.id !== story.id)
    setList(nl)
    if (nl.length === 0) {
      onDeleted()
      return
    }
    setIdx(i => Math.min(i, nl.length - 1))
  }

  if (!story) {
    onClose()
    return null
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{author?.full_name || author?.username || 'Status'}</p>
          <p className="text-[10px] text-zinc-400">
            @{author?.username}
            {list.length > 1 ? ` · ${idx + 1}/${list.length}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwn ? (
            <Button type="button" size="sm" variant="destructive" className="h-8" onClick={() => void onDelete()}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          ) : null}
          <button type="button" className="p-2 rounded-full hover:bg-white/10 text-white" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-stretch justify-center min-h-0 relative">
        {list.length > 1 && idx > 0 ? (
          <button
            type="button"
            className="absolute left-0 top-0 bottom-0 w-[28%] max-w-[120px] z-10 flex items-center justify-start pl-2"
            onClick={goPrev}
            aria-label="Previous"
          >
            <span className="p-2 rounded-full bg-white/10 text-white">
              <ChevronLeft className="h-6 w-6" />
            </span>
          </button>
        ) : null}
        {list.length > 1 && idx < list.length - 1 ? (
          <button
            type="button"
            className="absolute right-0 top-0 bottom-0 w-[28%] max-w-[120px] z-10 flex items-center justify-end pr-2"
            onClick={goNext}
            aria-label="Next"
          >
            <span className="p-2 rounded-full bg-white/10 text-white">
              <ChevronRight className="h-6 w-6" />
            </span>
          </button>
        ) : null}
        <div className="flex-1 flex items-center justify-center p-4 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story.media_url} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      </div>
    </div>
  )
}
