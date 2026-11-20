'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Heart, Lightbulb, MapPin, SendHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, newClientId } from '@/lib/api/client'
import type { Post, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { useReactions } from './ReactionBar'
import { MiniArc } from './SeatRing'
import { Avatar } from './PostCard'
import { ago, dateRange, rupees } from './format'

export type StoryGroup = { author: UserLite; stories: Post[] }

const STORY_MS = 6000
const noopSubscribe = () => () => {}

/**
 * Full-screen story viewer: progress bars across the author's stories, tap left/right to move,
 * swipe down or Esc to close, reply bar + quick reactions at the bottom (real comment/reaction APIs).
 */
export function StoryViewer({ groups, startGroup, onClose, onSeen, plans, signedIn, demo }: {
  groups: StoryGroup[]
  startGroup: number
  onClose: () => void
  onSeen?: (postId: string) => void
  /** Live plans by author id: rides along as a joinable card when the story has no linked trip. */
  plans?: Map<string, Post>
  signedIn: boolean
  demo?: boolean
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const [pos, setPos] = useState({ g: startGroup, s: 0 })
  const [held, setHeld] = useState(false)
  const [typing, setTyping] = useState(false)
  const [hidden, setHidden] = useState(false)
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const group = groups[pos.g]
  const story = group?.stories[pos.s]
  const paused = held || typing || hidden

  const next = useCallback(() => {
    const g = groups[pos.g]
    if (g && pos.s < g.stories.length - 1) setPos({ g: pos.g, s: pos.s + 1 })
    else if (pos.g < groups.length - 1) setPos({ g: pos.g + 1, s: 0 })
    else onClose()
  }, [groups, pos, onClose])
  const prev = useCallback(() => {
    if (pos.s > 0) setPos({ g: pos.g, s: pos.s - 1 })
    else if (pos.g > 0) setPos({ g: pos.g - 1, s: groups[pos.g - 1].stories.length - 1 })
  }, [groups, pos])

  useEffect(() => { if (story) onSeen?.(story.id) }, [story, onSeen])

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    stageRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    const onVis = () => setHidden(document.hidden)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); prevFocus?.focus?.({ preventScroll: true }) }
  }, [next, prev, onClose])

  if (!mounted || !group || !story) return null

  function onPointerDown(e: React.PointerEvent) {
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    setHeld(true)
  }
  function onPointerUp(e: React.PointerEvent) {
    setHeld(false)
    const t = touch.current
    touch.current = null
    if (!t) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { onClose(); return }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      // Swipe between authors.
      if (dx < 0 && pos.g < groups.length - 1) setPos({ g: pos.g + 1, s: 0 })
      else if (dx > 0 && pos.g > 0) setPos({ g: pos.g - 1, s: 0 })
      return
    }
    if (Date.now() - t.t > 350) return // a hold, not a tap
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX - rect.left < rect.width * 0.35) prev()
    else next()
  }

  const plan = !story.trip ? plans?.get(story.author.id) : undefined

  return createPortal(
    <div className="fc-viewer" role="dialog" aria-modal="true" aria-label={`Stories from ${group.author.name}`}>
      <button type="button" className="fc-viewer-nav" style={{ left: 'max(16px, calc(50% - 300px))' }} onClick={prev} disabled={pos.g === 0 && pos.s === 0} aria-label="Previous story"><ChevronLeft /></button>
      <div ref={stageRef} tabIndex={-1} className="fc-viewer-stage outline-none">
        {story.media[0]
          ? <>
              {/* Small version first, the full photo covers it when it arrives. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(story.media[0].thumbUrl ?? story.media[0].lqip) && <img key={`low-${story.id}`} src={(story.media[0].thumbUrl ?? story.media[0].lqip)!} alt="" aria-hidden className="fc-viewer-bg" draggable={false} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={`img-${story.id}`} src={story.media[0].url} alt={story.title ?? `Story by ${story.author.name}`} className="fc-viewer-bg" draggable={false} />
            </>
          : <div className="fc-viewer-textbg" aria-hidden />}
        <div className="fc-viewer-shade" aria-hidden />

        <div className="fc-viewer-bars" aria-hidden>
          {group.stories.map((s, i) => (
            <span key={s.id}>
              <b
                key={`${s.id}-${pos.g}-${pos.s}`}
                style={i < pos.s ? { transform: 'none' } : i > pos.s ? { transform: 'scaleX(0)' } : { animation: `fc-progress ${STORY_MS}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
                onAnimationEnd={i === pos.s ? next : undefined}
              />
            </span>
          ))}
        </div>

        <div className="fc-viewer-top">
          <Avatar user={story.author} size={36} className="shadow-[0_0_0_2px_#fff]" />
          <Link href={`/tribe/p/${story.id}`} className="min-w-0 flex-1" onClick={onClose}>
            <span className="block truncate text-[14px] font-bold">{story.author.name} <span className="font-medium opacity-80">· {ago(story.createdAt)}</span></span>
            {story.place && <span className="flex items-center gap-1 truncate text-[12.5px] opacity-90"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{story.place.name}</span>}
          </Link>
          <button type="button" className="pc-iconbtn" onClick={onClose} aria-label="Close stories"><X className="h-6 w-6" /></button>
        </div>

        {/* Tap zones (and hold to pause, swipe down to close) */}
        <div className="absolute inset-0 z-[3]" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { setHeld(false); touch.current = null }} aria-hidden />

        <div className="fc-viewer-body">
          {(story.title || story.body) && (
            <p className="fc-viewer-caption fc-glass">{story.title ? <><span className="block">{story.title}</span><span className="block text-[14px] font-medium opacity-90">{story.body}</span></> : story.body}</p>
          )}
          {story.trip ? (
            <Link href={`/packages/${story.trip.slug}`} className="fc-viewer-link" onClick={onClose}>
              {story.trip.seatsTotal && story.trip.seatsLeft != null ? <MiniArc total={story.trip.seatsTotal} taken={story.trip.seatsTotal - story.trip.seatsLeft} size={38} /> : null}
              <span className="min-w-0">
                <b className="block truncate">{story.trip.title}</b>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {story.trip.nextDeparture ? `Next ${dateRange(story.trip.nextDeparture, null)} · ` : ''}{story.trip.seatsLeft != null ? `${story.trip.seatsLeft} ${story.trip.seatsLeft === 1 ? 'spot' : 'spots'} left · ` : ''}{rupees(story.trip.priceFromPaise)}
                </span>
              </span>
              <b className="ml-1 shrink-0 text-[13px] text-[color:var(--pc-accent-ink)]">Grab a spot →</b>
            </Link>
          ) : plan ? (
            <Link href={`/tribe/p/${plan.id}`} className="fc-viewer-link" onClick={onClose}>
              {plan.spotsTotal ? <MiniArc total={plan.spotsTotal} taken={plan.memberCount} size={38} women={plan.audience === 'women'} /> : null}
              <span className="min-w-0">
                <b className="block truncate">{plan.title ?? plan.place?.name}</b>
                <span className="block truncate text-[12px] text-muted-foreground">{story.author.name.split(' ')[0]}’s next plan · {Math.max((plan.spotsTotal ?? 0) - plan.memberCount, 0)} spots</span>
              </span>
              <b className="ml-1 shrink-0 text-[13px] text-[color:var(--pc-accent-ink)]">Join →</b>
            </Link>
          ) : null}
        </div>

        <StoryReplyBar key={`reply-${story.id}`} post={story} signedIn={signedIn} demo={demo} onTyping={setTyping} />
      </div>
      <button type="button" className="fc-viewer-nav" style={{ right: 'max(16px, calc(50% - 300px))' }} onClick={next} aria-label="Next story"><ChevronRight /></button>
    </div>,
    document.body,
  )
}

function StoryReplyBar({ post, signedIn, demo, onTyping }: { post: Post; signedIn: boolean; demo?: boolean; onTyping: (v: boolean) => void }) {
  const router = useRouter()
  const { mine, toggle } = useReactions(post, signedIn, demo)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const first = post.author.name.split(' ')[0]

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    if (!signedIn) { router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`); return }
    setBusy(true)
    try {
      if (!demo) await apiFetch(`/posts/${post.id}/comments`, { body: { clientId: newClientId(), body, parentId: null } })
      setText('')
      toast.success(`Reply sent to ${first}`)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }

  const quick = [
    { kind: 'love' as const, key: 'love' as const, label: 'Love', icon: Heart },
    { kind: 'want_to_go' as const, key: 'wantToGo' as const, label: 'Want to go', icon: MapPin },
    { kind: 'helpful' as const, key: 'helpful' as const, label: 'Helpful', icon: Lightbulb },
  ]
  return (
    <form className="fc-viewer-reply" onSubmit={send}>
      <input className="fc-glass" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={`Reply to ${first}…`} aria-label={`Reply to ${first}`}
        onFocus={() => onTyping(true)} onBlur={() => onTyping(false)} />
      {text.trim() ? (
        <button type="submit" className="fc-send" disabled={busy} aria-label="Send reply"><SendHorizontal className="h-5 w-5" /></button>
      ) : quick.map((q) => (
        <button key={q.kind} type="button" className={cn('fc-viewer-quick', q.kind === 'love' && 'is-love')} aria-pressed={mine.includes(q.kind)} aria-label={q.label}
          onClick={() => toggle(q.kind, q.key)}>
          <q.icon aria-hidden />
        </button>
      ))}
    </form>
  )
}
