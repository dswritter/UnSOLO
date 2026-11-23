'use client'

import { seatLong } from '@/lib/seats'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Clock3, Flag, Lock, MessageCircle, MoreHorizontal, SendHorizontal, Share2, Trash2, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiClientError, newClientId } from '@/lib/api/client'
import { track } from '@/lib/analytics/client'
import { clearDraft, useTextDraft } from '@/lib/drafts'
import { requestPhoneVerification } from '@/lib/phone-gate'
import type { Comment, HostOffer, Post, Seat, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { ProgressiveImage } from './ProgressiveImage'
import { ReactionBar } from './ReactionBar'
import { PollOptions } from './PollCard'
import { SeatRing } from './SeatRing'
import { Sheet } from './Sheet'
import { CommentRow } from './CommentRow'
import { AuthorRow, Avatar, PlanFacts, TripLinkCard, WomenTag, planRing } from './PostCard'
import { MentionSuggest } from './MentionSuggest'
import { ago, initials, rupees } from './format'

const REASONS = [
  ['spam', 'Spam'], ['scam_money', 'Asking for money / scam'], ['harassment', 'Harassment'], ['unsafe_meetup', 'Unsafe meetup'],
  ['fake_profile', 'Fake profile'], ['hate', 'Hate'], ['sexual', 'Sexual content'], ['other', 'Something else'],
] as const

const firstName = (u: { name: string }) => u.name.split(' ')[0]

/** ≥1024px. The plan circle renders once (inline on phones, side panel on desktop): SVG clip paths
 *  inside a display:none copy would blank the visible ring's photo. Server snapshot = phone layout. */
const DESKTOP = '(min-width: 1024px)'
function subscribeDesktop(cb: () => void) {
  const m = window.matchMedia(DESKTOP)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false)
}

export function PostDetailClient({ post: initial, comments: initialComments, offers, signedIn, viewerId, viewerName, demo }: {
  post: Post
  comments: Comment[]
  offers: HostOffer[]
  signedIn: boolean
  viewerId: string | null
  viewerName: string | null
  demo: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [post, setPost] = useState(initial)
  const [comments, setComments] = useState(initialComments)
  const [joinOpen, setJoinOpen] = useState(params.get('join') === '1' && initial.viewer.canJoin)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [stamp, setStamp] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [mode, setMode] = useState<'action' | 'comment'>(initial.kind === 'plan' && !initial.viewer.isAuthor ? 'action' : 'comment')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isPlan = post.kind === 'plan'
  const me: UserLite = { id: viewerId ?? 'me', username: '', name: viewerName ?? 'You', avatarUrl: null, isPhoneVerified: true, isIdVerified: false, isHost: false }

  useEffect(() => { track('screen.view', { kind: post.kind }, 'post_detail') }, [post.kind])

  /** Anything typed is already saved as a draft, so it's waiting when they come back signed in. */
  function requireSignIn(to: 'join' | 'comments' = isPlan ? 'join' : 'comments') {
    router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}${to === 'join' ? '?join=1' : '#comments'}`)}`)
  }
  async function verifyPhoneThenJoin() {
    if (await requestPhoneVerification()) { router.refresh(); setJoinOpen(true) }
  }

  const focusComposer = useCallback((c?: Comment | null) => {
    setMode('comment')
    if (c !== undefined) setReplyTo(c)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  /** Optimistic: the viewer's face waits at the edge of the circle immediately. */
  async function sendJoin(intro: string) {
    const prev = post
    const seats: Seat[] = [...post.seats]
    const idx = seats.findIndex((s) => s.state === 'open')
    if (idx >= 0) seats[idx] = { state: 'requested', user: me }
    setPost({ ...post, seats, viewer: { ...post.viewer, membership: 'requested', canJoin: false } })
    setStamp(true)
    setJoinOpen(false)
    if (demo) { toast.success(`Request sent to ${firstName(post.author)}`); return }
    try {
      await apiFetch(`/posts/${post.id}/join`, { body: { intro } })
      clearDraft(`join.${post.id}`)
      toast.success(`Request sent. ${firstName(post.author)} usually replies within a day.`)
    } catch (e) {
      setPost(prev)
      setJoinOpen(true) // the intro is still in its draft
      if (!(e instanceof ApiClientError && e.code === 'phone_required')) toast.error((e as Error).message)
    }
  }

  async function withdraw() {
    const prev = post
    setPost({ ...post, seats: post.seats.map((s) => (s.state === 'requested' ? { state: 'open', user: null } : s)), viewer: { ...post.viewer, membership: null, canJoin: true } })
    setStamp(false)
    if (demo) return
    try { await apiFetch(`/posts/${post.id}/join`, { method: 'DELETE' }) } catch (e) { setPost(prev); toast.error((e as Error).message) }
  }

  /** Resolves false when the comment didn't go through (the composer puts the text back). */
  async function addComment(body: string, parentId: string | null, pollChoice?: string): Promise<boolean> {
    if (!signedIn) { requireSignIn('comments'); return false }
    const clientId = newClientId()
    const temp: Comment = { id: `tmp-${clientId}`, postId: post.id, parentId, author: { ...me, id: viewerId ?? '' }, body, pollChoice: null, createdAt: new Date().toISOString(), replies: [] }
    const apply = (c: Comment, replace?: string) => setComments((cs) => {
      if (!parentId) return replace ? cs.map((x) => (x.id === replace ? c : x)) : [...cs, c]
      return cs.map((x) => (x.id === parentId ? { ...x, replies: replace ? x.replies.map((r) => (r.id === replace ? c : r)) : [...x.replies, c] } : x))
    })
    apply(temp)
    if (demo) return true
    try {
      const saved = await apiFetch<Comment>(`/posts/${post.id}/comments`, { body: { clientId, body, parentId, pollChoice } })
      apply(saved, temp.id)
      return true
    } catch (e) {
      setComments((cs) => cs.filter((x) => x.id !== temp.id).map((x) => ({ ...x, replies: x.replies.filter((r) => r.id !== temp.id) })))
      if (!(e instanceof ApiClientError && e.code === 'phone_required')) toast.error((e as Error).message)
      return false
    }
  }

  async function report(reason: string, details: string) {
    setReportOpen(false)
    if (demo) { toast.success('Thanks. Our team will review this.'); return }
    try {
      await apiFetch('/reports', { body: { targetType: 'post', targetId: post.id, reason, details: details || undefined } })
      toast.success('Thanks for telling us. Safety reports are reviewed within 2 hours.')
    } catch (e) { toast.error((e as Error).message) }
  }

  async function block() {
    setMenuOpen(false)
    if (!demo) await apiFetch('/blocks', { body: { userId: post.author.id } }).catch((e) => toast.error(e.message))
    toast.success(`${post.author.name} is blocked`)
    router.push('/tribe')
  }

  async function share() {
    const url = `${location.origin}/tribe/p/${post.id}`
    const text = isPlan ? `${firstName(post.author)} needs ${Math.max((post.spotsTotal ?? 0) - post.memberCount, 0)} for ${post.place?.name} — on UnSOLO` : post.title ?? 'On UnSOLO'
    track('share.plan', { channel: 'navigator' in window && 'share' in navigator ? 'native' : 'copy' })
    if (navigator.share) await navigator.share({ title: text, url }).catch(() => undefined)
    else { await navigator.clipboard.writeText(url); toast.success('Link copied') }
  }

  const kindLabel = isPlan ? 'Plan' : post.kind === 'story' ? 'Story' : post.poll ? 'Poll' : 'Question'
  const ring = planRing(post, signedIn)
  const total = ring.segs.length
  const openSpots = Math.max(total - ring.taken, 0)
  const isAsk = post.kind === 'ask'
  const desktop = useIsDesktop()

  return (
    <div className={cn('mx-auto w-full lg:px-8 lg:pt-6', isPlan ? 'max-w-[1180px] lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8' : 'max-w-[760px]')}>
      <main className="min-w-0">
        {/* Phones: round back button top-left (no tab bar on detail pages), share + more on the right. */}
        <div className="sticky top-0 z-30 flex items-center gap-1 bg-[color:var(--pc-paper)]/90 px-2 py-2 backdrop-blur lg:hidden">
          <BackButton />
          <b className="flex-1 text-center text-[15px]">{kindLabel}</b>
          <button type="button" className="pc-iconbtn" aria-label="Share" onClick={() => void share()}><Share2 className="h-5 w-5" /></button>
          <button type="button" className="pc-iconbtn" aria-label="More" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}><MoreHorizontal className="h-5 w-5" /></button>
        </div>
        <nav className="mb-3 hidden text-sm lg:block"><Link href="/tribe" className="pc-link inline-flex items-center gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden />Tribe</Link></nav>

        <article className={cn('mx-3.5 lg:mx-0', isPlan ? 'pc-pencilled p-4 sm:p-5' : post.kind === 'ask' ? 'pc-card p-4 sm:p-5' : '')}>
          {post.kind === 'story' && post.media.length > 0 && <Gallery post={post} />}
          <div className={cn(post.kind === 'story' && 'px-0.5 pt-3')}>
            <AuthorRow user={post.author} size={40}
              sub={[isPlan ? 'Plan · looking for people' : kindLabel, post.kind === 'story' ? post.place?.name : null, ago(post.createdAt)].filter(Boolean).join(' · ')}
              trailing={<>
                {isPlan && ring.women && <WomenTag />}
                {isPlan && post.audience === 'verified' && <span className="pc-tag pc-tag-verified shrink-0">Verified only</span>}
                <button type="button" className="pc-iconbtn hidden lg:inline-grid" aria-label="More" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}><MoreHorizontal className="h-5 w-5" /></button>
              </>} />

            {isPlan ? (
              <h1 className="mt-4 text-[26px] leading-tight sm:text-[30px]">{post.title ?? post.place?.name}</h1>
            ) : isAsk ? (
              <h1 className="mt-4 text-[24px] leading-snug sm:text-[28px]">{post.body}</h1>
            ) : post.title ? (
              <h1 className="mt-3 text-[24px] leading-tight">{post.title}</h1>
            ) : null}

            {isPlan && <PlanFacts post={post} className="mt-3" />}
            {(!isAsk || post.title) && <p className={cn('whitespace-pre-line text-[16px] leading-relaxed', isPlan || post.title ? 'mt-3' : 'mt-2.5')}>{post.body}</p>}

            {isPlan && !desktop && (
              <div className="mt-5">
                <PlanCircle post={post} ring={ring} stamp={stamp} />
              </div>
            )}
            {isPlan && post.estCostText && <p className="mt-4 text-sm text-muted-foreground">{post.estCostText}. No money is paid through UnSOLO for community plans.</p>}
            {post.poll && <PollOptions post={post} signedIn={signedIn} demo={demo} />}
            {post.trip && <TripLinkCard trip={post.trip} className="mt-4" />}

            {isPlan && (
              <div className="mt-5 lg:hidden">
                <PlanStatus post={post} offers={offers} demo={demo} openSpots={openSpots} onWithdraw={withdraw} />
              </div>
            )}
            <div className="mt-2"><ReactionBar post={post} signedIn={signedIn} demo={demo} onComment={() => focusComposer()} /></div>
          </div>
        </article>

        <Comments comments={comments} post={post} isAsk={isAsk} onReply={(c) => focusComposer(c)} />

        <div className="fc-bar-spacer is-column" aria-hidden />
        <div className="fc-bar is-column">
          {/* Plan action row (phones and tablets; desktop keeps it in the side panel) */}
          {isPlan && !post.viewer.isAuthor && (
            <div className={cn('fc-bar-inner', mode === 'action' ? 'flex lg:hidden' : 'hidden')}>
              <button type="button" className="pc-iconbtn" aria-label="Write a reply" onClick={() => focusComposer()}><MessageCircle className="h-5 w-5" /></button>
              <PlanBarAction post={post} openSpots={openSpots} signedIn={signedIn} onJoin={() => (!signedIn ? requireSignIn('join') : post.viewer.joinBlockedReason === 'phone_required' ? void verifyPhoneThenJoin() : setJoinOpen(true))} onWithdraw={withdraw} />
            </div>
          )}
          <div className={cn(mode === 'comment' || !isPlan || post.viewer.isAuthor ? 'block' : 'hidden lg:block')}>
            <CommentComposer
              postId={post.id} signedIn={signedIn} me={me} isAsk={isAsk} replyTo={replyTo} inputRef={inputRef}
              onCancelReply={() => setReplyTo(null)}
              onBack={isPlan && !post.viewer.isAuthor ? () => { setMode('action'); setReplyTo(null) } : undefined}
              onSignIn={() => requireSignIn('comments')}
              onSend={(body) => { const parent = replyTo ? (replyTo.parentId ?? replyTo.id) : null; setReplyTo(null); return addComment(body, parent) }}
            />
          </div>
        </div>
      </main>

      {/* Desktop: the circle and the join / organiser panel ride along on the right. */}
      {isPlan && desktop && (
        <aside>
          <div className="pc-pencilled sticky top-6 p-5">
            <PlanCircle post={post} ring={ring} stamp={stamp} />
            <div className="mt-5">
              <PlanStatus post={post} offers={offers} demo={demo} openSpots={openSpots} onWithdraw={withdraw} desktop
                onJoin={() => (!signedIn ? requireSignIn('join') : post.viewer.joinBlockedReason === 'phone_required' ? void verifyPhoneThenJoin() : setJoinOpen(true))} signedIn={signedIn} />
            </div>
          </div>
        </aside>
      )}

      {joinOpen && <JoinSheet post={post} onClose={() => setJoinOpen(false)} onSend={sendJoin} />}
      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} onSend={report} />}
      <MoreSheet open={menuOpen} post={post} onClose={() => setMenuOpen(false)} onShare={() => { setMenuOpen(false); void share() }}
        onReport={() => { setMenuOpen(false); if (signedIn) setReportOpen(true); else requireSignIn() }}
        onBlock={() => (signedIn ? block() : requireSignIn())}
        onDelete={async () => {
          try {
            await apiFetch(`/posts/${post.id}`, { method: 'DELETE' })
            setMenuOpen(false)
            toast.success('Post deleted')
            router.push('/tribe')
            router.refresh()
          } catch (e) { toast.error((e as Error).message || 'Couldn’t delete it. Try again.') }
        }} />
    </div>
  )
}

function BackButton() {
  const router = useRouter()
  return (
    <button type="button" className="pc-iconbtn border border-[color:var(--pc-rule)] bg-[color:var(--pc-raised)]" aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/tribe'))}>
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

function Gallery({ post }: { post: Post }) {
  const [first, ...rest] = post.media
  return (
    <div className="space-y-1.5">
      <ProgressiveImage media={first} alt={post.title ?? 'Story photo'} className="aspect-[4/3] w-full rounded-[var(--pc-radius-image)]" priority />
      {rest.length > 0 && (
        <div className={cn('grid gap-1.5', rest.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {rest.map((m, i) => <ProgressiveImage key={i} media={m} alt="" className="aspect-square w-full rounded-[var(--pc-radius-image)]" />)}
        </div>
      )}
    </div>
  )
}

function planCaption(total: number, taken: number) {
  if (total <= 0) return null
  // The plan's own page: the group size shows here (lib/seats).
  if (taken >= total) return <><strong>Full</strong></>
  return <strong>{seatLong(total, total - taken)}</strong>
}

function PlanCircle({ post, ring, stamp }: { post: Post; ring: ReturnType<typeof planRing>; stamp: boolean }) {
  const requested = post.viewer.membership === 'requested'
  return (
    <section aria-label="Who's going" className="text-center">
      <div className="grid place-items-center px-10 pt-2">
        <SeatRing segs={ring.segs} size={220} variant="plan" women={ring.women} photo={post.author.avatarUrl} showDots={ring.showDots}
          waiting={ring.waiting} animateYou={stamp}
          center={post.author.avatarUrl ? undefined : { big: initials(post.author.name), fontSize: 46 }} />
      </div>
      <p className="fc-caption mt-3">{planCaption(ring.segs.length, ring.taken)}</p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {requested ? `Your face waits at the edge until ${firstName(post.author)} replies` : 'Group size includes the organiser'}
      </p>
    </section>
  )
}

function joinLabel(post: Post) {
  switch (post.viewer.joinBlockedReason) {
    case 'full': return 'Plan is full'
    case 'women_only': return 'Women only (ID verified)'
    case 'verified_only': return 'Verified travellers only'
    case 'phone_required': return 'Verify to join'
    case 'closed': return 'This plan is closed'
    default: return 'Request to join'
  }
}

/** Bottom-bar primary action for a plan (thumb reach). */
function PlanBarAction({ post, openSpots, signedIn, onJoin, onWithdraw }: { post: Post; openSpots: number; signedIn: boolean; onJoin: () => void; onWithdraw: () => void }) {
  const m = post.viewer.membership
  if (m === 'requested') {
    return (
      <>
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-1.5 text-[14px]"><Clock3 className="h-4 w-4 shrink-0" aria-hidden />Requested · waiting</b>
          <span className="block truncate text-[12px] text-muted-foreground">{firstName(post.author)} decides · expires in 72 h</span>
        </span>
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={onWithdraw}>Withdraw</button>
      </>
    )
  }
  if (m === 'approved') {
    return (
      <>
        <span className="min-w-0 flex-1 text-[14px] font-bold">You’re in</span>
        <Link href="/bookings" className="pc-btn">Open plan chat</Link>
      </>
    )
  }
  return (
    <>
      <span className="min-w-0 flex-1">
        <b className="block text-[14px]">{openSpots > 0 ? `${openSpots} ${openSpots === 1 ? 'spot' : 'spots'} open` : 'Plan is full'}</b>
        <span className="block truncate text-[12px] text-muted-foreground">By request · {firstName(post.author)} decides</span>
      </span>
      <button type="button" className="pc-btn pc-btn-sun" disabled={!post.viewer.canJoin && signedIn && post.viewer.joinBlockedReason !== 'phone_required'} onClick={onJoin}>{joinLabel(post)}</button>
    </>
  )
}

/** Plan status panel: organiser tools, "you're in", request pending, or join (desktop only). */
function PlanStatus({ post, offers, demo, openSpots, onWithdraw, onJoin, desktop, signedIn }: {
  post: Post; offers: HostOffer[]; demo: boolean; openSpots: number; onWithdraw: () => void; onJoin?: () => void; desktop?: boolean; signedIn?: boolean
}) {
  if (post.viewer.isAuthor) return <OrganiserPanel post={post} offers={offers} demo={demo} />
  if (post.viewer.membership === 'approved') {
    return (
      <div className="rounded-[22px] bg-[color:var(--pc-pine-soft)] p-4 text-left">
        <p className="font-bold">You’re in.</p>
        <p className="mt-1 text-sm text-muted-foreground"><Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden />Meeting point: {post.meetingPoint ?? 'the organiser will share it in the plan chat'}</p>
        {desktop && <Link href="/bookings" className="pc-btn pc-btn-block mt-3">Open plan chat</Link>}
        <OffersList offers={offers} demo={demo} canDecide={false} />
      </div>
    )
  }
  if (!desktop) return null
  if (post.viewer.membership === 'requested') {
    return (
      <div className="text-left">
        <p className="flex items-center gap-1.5 font-bold"><Clock3 className="h-4 w-4" aria-hidden />Requested · waiting</p>
        <p className="mt-1 text-sm text-muted-foreground">Pencilled in until {firstName(post.author)} replies. Requests expire after 72 hours.</p>
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-3" onClick={onWithdraw}>Withdraw request</button>
      </div>
    )
  }
  return (
    <div className="text-left">
      <p className="font-bold">{openSpots > 0 ? `${openSpots} ${openSpots === 1 ? 'spot' : 'spots'} open` : 'This plan is full'}</p>
      <p className="mt-1 text-sm text-muted-foreground">Joining is by request. Say hi and {firstName(post.author)} decides. The exact meeting point and the plan chat open after you’re approved.</p>
      <button type="button" className="pc-btn pc-btn-block mt-3" disabled={!post.viewer.canJoin && signedIn && post.viewer.joinBlockedReason !== 'phone_required'} onClick={onJoin}>{joinLabel(post)}</button>
      <Link href={`/?q=${encodeURIComponent(post.place?.name ?? '')}`} className="pc-link mt-3 block text-sm">Hosted {post.place?.name} trips on similar dates →</Link>
    </div>
  )
}

function CommentComposer({ postId, signedIn, me, isAsk, replyTo, inputRef, onCancelReply, onBack, onSignIn, onSend }: {
  postId: string
  signedIn: boolean
  me: UserLite
  isAsk: boolean
  replyTo: Comment | null
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  onCancelReply: () => void
  onBack?: () => void
  onSignIn: () => void
  onSend: (body: string) => Promise<boolean>
}) {
  // Saved as you type: survives signing in, reloads and going back, until sent or cleared.
  const [body, setBody] = useTextDraft(`comment.${postId}`)
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  // Replying pre-fills an @mention once per target (state adjusted during render, no effect needed).
  if (replyTo && prefilledFor !== replyTo.id) {
    setPrefilledFor(replyTo.id)
    const tag = `@${firstName(replyTo.author)} `
    if (!body.startsWith(tag)) setBody(tag + body.replace(/^@\S+\s/, ''))
  }
  function grow(el: HTMLTextAreaElement) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px` }
  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const b = body.trim()
    if (!b) return
    // Signed out: keep the words (they're in the draft) and come back here after signing in.
    if (!signedIn) { onSignIn(); return }
    setBody('')
    setPrefilledFor(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'
    if (!(await onSend(b))) setBody(b)
  }
  return (
    <div className="mx-auto max-w-[720px]">
      {replyTo && (
        <div className="fc-replying">
          <span>Replying to <b className="text-[color:var(--pc-ink)]">{replyTo.author.name}</b></span>
          <button type="button" className="pc-link" onClick={() => { onCancelReply(); setPrefilledFor(null); setBody(body.replace(/^@\S+\s/, '')) }}>Cancel</button>
        </div>
      )}
      <MentionSuggest value={body} onChange={setBody} inputRef={inputRef} signedIn={signedIn} />
      <form className="flex items-end gap-2" onSubmit={submit}>
        {onBack
          ? <button type="button" className="pc-iconbtn" aria-label="Back to join" onClick={onBack}><X className="h-5 w-5" /></button>
          : <Avatar user={me} size={36} className="mb-1 hidden sm:inline-grid" />}
        <textarea ref={inputRef} rows={1} value={body} maxLength={2000} className="fc-composer-input" aria-label={isAsk ? 'Your answer' : 'Your reply'}
          placeholder={isAsk ? 'Share what you know… use @ to tag' : 'Add a comment… use @ to tag'}
          onChange={(e) => { setBody(e.target.value); grow(e.target) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} />
        {signedIn
          ? <button type="submit" className="fc-send" disabled={!body.trim()} aria-label="Send"><SendHorizontal className="h-5 w-5" /></button>
          : <button type="submit" className="pc-btn pc-btn-sm mb-1 shrink-0">Sign in to send</button>}
      </form>
      {!signedIn && body.trim() && <p className="mt-1 px-1 text-[12px] text-muted-foreground">Your reply is saved on this device. It’ll be here after you sign in.</p>}
    </div>
  )
}

function Comments({ comments, post, isAsk, onReply }: { comments: Comment[]; post: Post; isAsk: boolean; onReply: (c: Comment) => void }) {
  const count = comments.reduce((n, c) => n + 1 + c.replies.length, 0)
  return (
    <section id="comments" className="mx-3.5 mt-6 scroll-mt-20 lg:mx-0" aria-label={isAsk ? 'Answers' : 'Replies'}>
      <h2 className="text-[19px]">{isAsk ? 'Answers' : 'Replies'} <span className="text-base font-semibold text-muted-foreground">{count}</span></h2>
      {comments.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{isAsk ? 'No answers yet. Been there? Help them out.' : 'No replies yet. Say something kind.'}</p>
      ) : (
        <ul className="mt-2">
          {comments.map((c) => (
            <li key={c.id} id={`c-${c.id}`}>
              <CommentRow c={c} post={post} onReply={() => onReply(c)} />
              {c.replies.map((r) => (
                <div key={r.id} id={`c-${r.id}`}><CommentRow c={r} post={post} reply onReply={() => onReply(r)} /></div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MoreSheet({ open, post, onClose, onShare, onReport, onBlock, onDelete }: { open: boolean; post: Post; onClose: () => void; onShare: () => void; onReport: () => void; onBlock: () => void; onDelete: () => Promise<void> }) {
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const close = () => { setConfirmBlock(false); setConfirmDelete(false); onClose() }
  return (
    <Sheet open={open} onClose={close} title={confirmDelete ? 'Delete this post?' : confirmBlock ? `Block ${post.author.name}?` : 'Post options'} labelledTitle={confirmBlock || confirmDelete}
      description={confirmDelete ? 'It’s removed from Tribe and your profile, with its comments and reactions. This can’t be undone.' : confirmBlock ? 'You won’t see each other’s posts or messages. They aren’t told.' : undefined}>
      {confirmDelete ? (
        <div className="fc-sheet-actions">
          <button type="button" className="pc-btn pc-btn-danger pc-btn-block" disabled={deleting}
            onClick={async () => { setDeleting(true); await onDelete(); setDeleting(false); setConfirmDelete(false) }}>{deleting ? 'Deleting…' : 'Delete post'}</button>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </div>
      ) : confirmBlock ? (
        <div className="fc-sheet-actions">
          <button type="button" className="pc-btn pc-btn-danger pc-btn-block" onClick={onBlock}>Block {firstName(post.author)}</button>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={() => setConfirmBlock(false)}>Cancel</button>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <button type="button" className="fc-menu-row" onClick={onShare}><Share2 aria-hidden />Share</button>
          {post.viewer.isAuthor && (
            <button type="button" className="fc-menu-row is-danger" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden />Delete post</button>
          )}
          {!post.viewer.isAuthor && <>
            <button type="button" className="fc-menu-row" onClick={onReport}><Flag aria-hidden />Report</button>
            <button type="button" className="fc-menu-row is-danger" onClick={() => setConfirmBlock(true)}><UserX aria-hidden />Block {firstName(post.author)}</button>
          </>}
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-3" onClick={close}>Cancel</button>
        </div>
      )}
    </Sheet>
  )
}

function JoinSheet({ post, onClose, onSend }: { post: Post; onClose: () => void; onSend: (intro: string) => void }) {
  const [intro, setIntro] = useTextDraft(`join.${post.id}`)
  const ok = intro.trim().length >= 10
  return (
    <Sheet title={`Ask ${firstName(post.author)} to join`} onClose={onClose}
      description="A short hello helps: where you’ve travelled, why this plan. Your phone number stays private.">
      <label className="mt-4 block text-sm font-semibold" htmlFor="intro">Say hi</label>
      <textarea id="intro" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={500} rows={4} className="pc-input mt-1.5"
        placeholder="Hi! Did Hampta Pass last year, very flexible on dates…" />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{ok ? 'Looks good' : 'At least 10 characters'}</span><span className="tabular-nums">{intro.length}/500</span></div>
      <p className="mt-3 text-xs text-muted-foreground">Meet first in a public place. You can share the plan with someone you trust.</p>
      <div className="fc-sheet-actions">
        <button type="button" className="pc-btn pc-btn-block" disabled={!ok} onClick={() => onSend(intro.trim())}>Send request</button>
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

function ReportSheet({ onClose, onSend }: { onClose: () => void; onSend: (reason: string, details: string) => void }) {
  const [reason, setReason] = useState<string>('')
  const [details, setDetails] = useState('')
  return (
    <Sheet title="Report this post" onClose={onClose}>
      <fieldset className="mt-3 space-y-0.5">
        <legend className="sr-only">Reason</legend>
        {REASONS.map(([id, label]) => (
          <label key={id} className="fc-menu-row cursor-pointer">
            <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} className="h-4 w-4 accent-[color:var(--pc-pine)]" /> {label}
          </label>
        ))}
      </fieldset>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} placeholder="Anything we should know? (optional)" className="pc-input mt-2" />
      <div className="fc-sheet-actions">
        <button type="button" className="pc-btn pc-btn-block" disabled={!reason} onClick={() => onSend(reason, details)}>Send report</button>
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

type JoinRequest = { user: { id: string; name: string; tripsCount: number; reviewsAvg: number | null; mutuals: number }; intro: string; state: string }

function OrganiserPanel({ post, offers, demo }: { post: Post; offers: HostOffer[]; demo: boolean }) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(demo ? [] : null)
  useEffect(() => {
    if (demo) return
    apiFetch<{ items: JoinRequest[] }>(`/posts/${post.id}/requests`).then((r) => setRequests(r.items)).catch(() => setRequests([]))
  }, [post.id, demo])
  async function decide(userId: string, decision: 'approve' | 'decline') {
    setRequests((rs) => rs?.map((r) => (r.user.id === userId ? { ...r, state: decision === 'approve' ? 'approved' : 'declined' } : r)) ?? null)
    try { await apiFetch(`/posts/${post.id}/requests/${userId}`, { body: { decision } }) } catch (e) { toast.error((e as Error).message) }
  }
  const pending = requests?.filter((r) => r.state === 'requested') ?? []
  return (
    <div className="text-left">
      <p className="font-bold">Your plan</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{requests === null ? 'Loading requests…' : pending.length ? `${pending.length} ${pending.length === 1 ? 'request' : 'requests'} waiting` : 'No requests waiting'}</p>
      <ul className="mt-3 space-y-2.5">
        {pending.map((r) => (
          <li key={r.user.id} className="rounded-[20px] border border-[color:var(--pc-rule)] bg-[color:var(--pc-raised)] p-3">
            <div className="flex items-center gap-2.5">
              <span className="fc-av h-9 w-9">{initials(r.user.name)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{r.user.name}</p>
                <p className="text-xs text-muted-foreground">{r.user.tripsCount} trips{r.user.reviewsAvg ? ` · ★ ${r.user.reviewsAvg}` : ''}{r.user.mutuals ? ` · ${r.user.mutuals} mutual` : ''}</p>
              </div>
            </div>
            <p className="fc-bubble mt-2 text-sm">“{r.intro}”</p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" className="pc-btn pc-btn-sm flex-1" onClick={() => decide(r.user.id, 'approve')}>Approve</button>
              <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm flex-1" onClick={() => decide(r.user.id, 'decline')}>Decline</button>
            </div>
          </li>
        ))}
      </ul>
      <OffersList offers={offers} demo={demo} canDecide />
    </div>
  )
}

function OffersList({ offers, demo, canDecide }: { offers: HostOffer[]; demo: boolean; canDecide: boolean }) {
  const router = useRouter()
  const pending = offers.filter((o) => o.state === 'pending')
  if (pending.length === 0) return null
  async function accept(o: HostOffer) {
    if (!confirm(`Accept ${o.host.name}'s offer at ${rupees(o.pricePaise)} each? Your plan becomes a hosted trip and every member gets 48 hours to pay for their spot.`)) return
    if (demo) return
    try {
      const r = await apiFetch<{ packageSlug: string }>(`/offers/${o.id}/accept`, { body: { expectedPricePaise: o.pricePaise } })
      router.push(`/packages/${r.packageSlug}`)
    } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="mt-4 border-t border-dashed border-[color:var(--pc-rule2)] pt-3">
      <p className="text-sm font-bold">Hosts offering to run this</p>
      <ul className="mt-2 space-y-2">
        {pending.map((o) => (
          <li key={o.id} className="pc-card rounded-[20px] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold"><span className="truncate">{o.host.name}</span><span className="pc-tag pc-tag-host fc-tag-sm">Host</span></span>
              <span className="pc-price text-[17px]">{rupees(o.pricePaise)}</span>
            </div>
            {o.includes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{o.includes.join(' · ')}</p>}
            {canDecide && <button type="button" className="pc-btn pc-btn-sm pc-btn-block mt-2" onClick={() => accept(o)}>Accept offer</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
