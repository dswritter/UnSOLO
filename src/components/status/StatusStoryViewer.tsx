'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StatusStripStory } from '@/actions/statusStories'
import { deleteStatusStory } from '@/actions/statusStories'
import { toast } from 'sonner'
import { markStatusStoriesViewed } from '@/lib/statusStories/viewed'

const SLIDE_MS = 5000

function unwrapAuthor(story: StatusStripStory) {
  const a = story.author as { username: string; full_name: string | null } | null | undefined
  if (!a) return null
  return Array.isArray(a) ? a[0] ?? null : a
}

function getRunBounds(flat: StatusStripStory[], i: number) {
  if (!flat[i]) return { start: 0, end: 0 }
  const aid = flat[i].author_id
  let start = i
  while (start > 0 && flat[start - 1]!.author_id === aid) start--
  let end = i
  while (end < flat.length - 1 && flat[end + 1]!.author_id === aid) end++
  return { start, end }
}

export function StatusStoryViewer({
  stories: initialPlaylist,
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
  const [list, setList] = useState<StatusStripStory[]>(initialPlaylist)
  const listRef = useRef(list)
  listRef.current = list

  const [idx, setIdx] = useState(() => Math.min(initialIndex, Math.max(0, initialPlaylist.length - 1)))
  const [paused, setPaused] = useState(false)

  const endsAtRef = useRef(Date.now() + SLIDE_MS)
  const pauseStartedRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const story = list[idx]
  const author = story ? unwrapAuthor(story) : null
  const isOwn = story?.author_id === currentUserId

  const { start: runStart, end: runEnd } = getRunBounds(list, idx)
  const runLen = runEnd - runStart + 1
  const segIdx = idx - runStart

  const markAndClose = useCallback(
    (upToIndex: number) => {
      const L = listRef.current
      const seen = L.slice(0, Math.min(upToIndex + 1, L.length))
        .filter(s => s.author_id !== currentUserId)
        .map(s => s.id)
      markStatusStoriesViewed(currentUserId, [...new Set(seen)])
      onCloseRef.current()
    },
    [currentUserId],
  )

  useEffect(() => {
    endsAtRef.current = Date.now() + SLIDE_MS
  }, [idx])

  useEffect(() => {
    if (paused) {
      pauseStartedRef.current = Date.now()
    } else if (pauseStartedRef.current != null) {
      endsAtRef.current += Date.now() - pauseStartedRef.current
      pauseStartedRef.current = null
    }
  }, [paused])

  useEffect(() => {
    if (paused || list.length === 0) return
    const rem = Math.max(0, endsAtRef.current - Date.now())
    const id = window.setTimeout(() => {
      setIdx(i => {
        const L = listRef.current
        if (i >= L.length - 1) {
          queueMicrotask(() => {
            const seen = L.filter(s => s.author_id !== currentUserId).map(s => s.id)
            markStatusStoriesViewed(currentUserId, [...new Set(seen)])
            onCloseRef.current()
          })
          return i
        }
        return i + 1
      })
    }, rem)
    return () => clearTimeout(id)
  }, [idx, paused, list.length, currentUserId])

  const goPrev = useCallback(() => {
    setPaused(false)
    setIdx(i => {
      if (i > 0) return i - 1
      queueMicrotask(() => markAndClose(0))
      return 0
    })
  }, [markAndClose])

  const goNext = useCallback(() => {
    setPaused(false)
    setIdx(i => {
      const L = listRef.current
      if (i < L.length - 1) return i + 1
      queueMicrotask(() => {
        const seen = L.filter(s => s.author_id !== currentUserId).map(s => s.id)
        markStatusStoriesViewed(currentUserId, [...new Set(seen)])
        onCloseRef.current()
      })
      return i
    })
  }, [currentUserId])

  const longTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressRef = useRef<{ t: number; zone: 'L' | 'M' | 'R'; longFired: boolean } | null>(null)

  function onMainPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    const zone: 'L' | 'M' | 'R' = x < w * 0.28 ? 'L' : x > w * 0.72 ? 'R' : 'M'
    pressRef.current = { t: Date.now(), zone, longFired: false }
    longTimerRef.current = setTimeout(() => {
      setPaused(true)
      if (pressRef.current) pressRef.current.longFired = true
    }, 240)
  }

  function onMainPointerUp() {
    if (longTimerRef.current) {
      clearTimeout(longTimerRef.current)
      longTimerRef.current = null
    }
    const p = pressRef.current
    pressRef.current = null
    if (!p) return
    if (p.longFired) {
      setPaused(false)
      return
    }
    const dt = Date.now() - p.t
    if (dt > 500) return
    if (p.zone === 'L') goPrev()
    else if (p.zone === 'R') goNext()
  }

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
    if (nl.length === 0) {
      onDeleted()
      return
    }
    setList(nl)
    setIdx(i => Math.min(i, nl.length - 1))
  }

  if (!story) {
    return null
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[630] bg-black flex flex-col touch-manipulation select-none">
      <div className="shrink-0 pt-[max(0.5rem,env(safe-area-inset-top,0px))] px-2">
        <div className="flex gap-1">
          {Array.from({ length: runLen }).map((_, j) => (
            <div key={`${runStart}-${j}`} className="h-0.5 flex-1 bg-white/25 rounded overflow-hidden">
              {j < segIdx ? <div className="h-full w-full bg-white" /> : null}
              {j === segIdx ? (
                <div
                  key={idx}
                  className="h-full w-full bg-white status-story-progress-fill"
                  style={{
                    animation: `status-slide-progress ${SLIDE_MS}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                    transformOrigin: 'left center',
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div data-status-header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
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
          <button
            type="button"
            className="p-2 rounded-full hover:bg-white/10 text-white"
            onClick={() => markAndClose(idx)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-stretch justify-center min-h-0 relative"
        onPointerDown={onMainPointerDown}
        onPointerUp={onMainPointerUp}
        onPointerCancel={onMainPointerUp}
        onPointerLeave={e => {
          if (e.buttons === 0) onMainPointerUp()
        }}
      >
        <div className="flex-1 flex items-center justify-center p-4 min-w-0 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story.media_url} alt="" className="max-w-full max-h-full object-contain pointer-events-none" draggable={false} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
