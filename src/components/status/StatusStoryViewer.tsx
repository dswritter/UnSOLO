'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { X, Trash2, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StatusStripStory } from '@/actions/statusStories'
import { deleteStatusStory, recordStatusStoryViews, getStatusStoryViewers } from '@/actions/statusStories'
import { toast } from 'sonner'
import { markStatusStoriesViewed } from '@/lib/statusStories/viewed'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

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
  const idxRef = useRef(idx)
  idxRef.current = idx

  const [paused, setPaused] = useState(false)
  const [loadedMediaId, setLoadedMediaId] = useState<string | null>(null)
  const [seenOpen, setSeenOpen] = useState(false)

  const endsAtRef = useRef(Date.now() + SLIDE_MS)
  const pauseStartedRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const closedRef = useRef(false)
  const queryClient = useQueryClient()

  const story = list[idx]
  const author = story ? unwrapAuthor(story) : null
  const isOwn = story?.author_id === currentUserId
  const loadingImage = !!story && loadedMediaId !== story.id

  const storyIdForSeenList = seenOpen && isOwn && story?.id ? story.id : null
  const {
    data: seenRows = [],
    isLoading: seenLoading,
    error: seenQueryError,
  } = useQuery({
    queryKey: ['status-story-viewers', storyIdForSeenList],
    queryFn: async () => {
      const r = await getStatusStoryViewers(storyIdForSeenList!)
      if (r.error) throw new Error(r.error)
      return r.viewers
    },
    enabled: !!storyIdForSeenList,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  useEffect(() => {
    if (seenQueryError) toast.error((seenQueryError as Error).message)
  }, [seenQueryError])

  useEffect(() => {
    if (!seenOpen || !storyIdForSeenList) return
    void queryClient.invalidateQueries({ queryKey: ['status-story-viewers', storyIdForSeenList] })
  }, [seenOpen, storyIdForSeenList, queryClient])

  useEffect(() => {
    if (!isOwn || !story?.id) return
    const sb = createClient()
    const ch = sb
      .channel(`status-views-live-${story.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'status_story_views',
          filter: `story_id=eq.${story.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['status-story-viewers', story.id] })
        },
      )
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [isOwn, story?.id, queryClient])

  const { start: runStart, end: runEnd } = getRunBounds(list, idx)
  const runLen = runEnd - runStart + 1
  const segIdx = idx - runStart

  /** `pop` = browser/OS back popped our entry; `ui` = Esc/X/end of carousel — may call history.back() once to sync stack */
  const finalizeClose = useCallback((source: 'pop' | 'ui') => {
    if (closedRef.current) return
    closedRef.current = true
    const L = listRef.current
    const i = idxRef.current
    const others = L.slice(0, i + 1)
      .filter(s => s.author_id !== currentUserId)
      .map(s => s.id)
    const uniq = [...new Set(others)]
    markStatusStoriesViewed(currentUserId, uniq)
    void recordStatusStoryViews(uniq)
    onCloseRef.current()
    if (source === 'ui' && window.history.state?.statusViewer) {
      window.history.back()
    }
  }, [currentUserId])

  useEffect(() => {
    window.history.pushState({ statusViewer: true }, '')
    const onPop = () => {
      finalizeClose('pop')
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [finalizeClose])

  useEffect(() => {
    endsAtRef.current = Date.now() + SLIDE_MS
  }, [idx])

  useEffect(() => {
    const hold = paused || seenOpen
    if (hold) {
      if (pauseStartedRef.current == null) pauseStartedRef.current = Date.now()
    } else if (pauseStartedRef.current != null) {
      endsAtRef.current += Date.now() - pauseStartedRef.current
      pauseStartedRef.current = null
    }
  }, [paused, seenOpen])

  useEffect(() => {
    if (paused || seenOpen || list.length === 0 || loadingImage) return
    const rem = Math.max(0, endsAtRef.current - Date.now())
    const id = window.setTimeout(() => {
      setIdx(i => {
        const L = listRef.current
        if (i >= L.length - 1) {
          queueMicrotask(() => finalizeClose('ui'))
          return i
        }
        return i + 1
      })
    }, rem)
    return () => clearTimeout(id)
  }, [idx, paused, seenOpen, list.length, loadingImage, finalizeClose])

  const goPrev = useCallback(() => {
    setPaused(false)
    setIdx(i => {
      if (i > 0) return i - 1
      queueMicrotask(() => finalizeClose('ui'))
      return 0
    })
  }, [finalizeClose])

  const goNext = useCallback(() => {
    setPaused(false)
    setIdx(i => {
      const L = listRef.current
      if (i < L.length - 1) return i + 1
      queueMicrotask(() => finalizeClose('ui'))
      return i
    })
  }, [finalizeClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return

      if (e.key === 'Escape') {
        e.preventDefault()
        if (seenOpen) {
          setSeenOpen(false)
          return
        }
        finalizeClose('ui')
        return
      }

      if (seenOpen) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        setPaused(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seenOpen, finalizeClose, goPrev, goNext])

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
      closedRef.current = true
      const L = listRef.current
      const i = idxRef.current
      const others = L.slice(0, i + 1)
        .filter(s => s.author_id !== currentUserId)
        .map(s => s.id)
      markStatusStoriesViewed(currentUserId, [...new Set(others)])
      void recordStatusStoryViews(others)
      if (window.history.state?.statusViewer) window.history.back()
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
    <>
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
                      animation: loadingImage ? undefined : `status-slide-progress ${SLIDE_MS}ms linear forwards`,
                      animationPlayState: paused || loadingImage || seenOpen ? 'paused' : 'running',
                      transformOrigin: 'left center',
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div data-status-header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{author?.full_name || author?.username || 'Status'}</p>
            <p className="text-[11px] text-zinc-300 truncate">
              {formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}
            </p>
            <p className="text-[10px] text-zinc-500 truncate">@{author?.username}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isOwn ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2 bg-white/10 text-white border-0 hover:bg-white/20"
                  title="Seen by"
                  onClick={() => {
                    setSeenOpen(true)
                  }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> Seen
                </Button>
                <Button type="button" size="sm" variant="destructive" className="h-8" onClick={() => void onDelete()}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </>
            ) : null}
            <button
              type="button"
              className="p-2 rounded-full hover:bg-white/10 text-white"
              onClick={() => finalizeClose('ui')}
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
          <div className="flex-1 flex items-center justify-center p-4 min-w-0 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={story.id}
              src={story.media_url}
              alt=""
              className={`max-w-full max-h-full object-contain pointer-events-none transition-opacity duration-200 ${loadingImage ? 'opacity-40' : 'opacity-100'}`}
              draggable={false}
              onLoad={() => {
                setLoadedMediaId(story.id)
              }}
              onError={() => {
                setLoadedMediaId(story.id)
              }}
            />
            {loadingImage ? (
              <div className="absolute inset-4 flex items-center justify-center pointer-events-none rounded-xl bg-black/50 backdrop-blur-md border border-white/10">
                <Loader2 className="h-10 w-10 text-white animate-spin opacity-90" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {seenOpen && isOwn && story ? (
        <div className="fixed inset-0 z-[640] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={() => setSeenOpen(false)} />
          <div
            className="relative w-full sm:max-w-md max-h-[70dvh] flex flex-col bg-zinc-900 border border-white/10 sm:rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="font-semibold text-white">Seen by</h3>
              <button type="button" className="p-2 rounded-lg hover:bg-white/10 text-white" onClick={() => setSeenOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2">
              {seenLoading ? (
                <p className="text-sm text-zinc-400 text-center py-8">Loading…</p>
              ) : seenRows.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">No views yet</p>
              ) : (
                <ul className="space-y-1">
                  {seenRows.map(row => (
                    <li key={row.viewer_id}>
                      <Link
                        href={`/profile/${row.username}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5"
                        onClick={() => setSeenOpen(false)}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={row.avatar_url || ''} />
                          <AvatarFallback className="text-xs">{getInitials(row.full_name || row.username)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="text-sm text-white font-medium block truncate">{row.full_name || row.username}</span>
                          <span className="text-[11px] text-zinc-500">@{row.username}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}
