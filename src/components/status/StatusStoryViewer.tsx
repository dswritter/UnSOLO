'use client'

import { X, Trash2 } from 'lucide-react'
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
  story,
  currentUserId,
  onClose,
  onDeleted,
}: {
  story: StatusStripStory
  currentUserId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const author = unwrapAuthor(story)
  const isOwn = story.author_id === currentUserId

  async function onDelete() {
    if (!window.confirm('Delete this status?')) return
    const r = await deleteStatusStory(story.id)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success('Status removed')
    onDeleted()
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{author?.full_name || author?.username || 'Status'}</p>
          <p className="text-[10px] text-zinc-400">@{author?.username}</p>
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
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.media_url} alt="" className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  )
}
