'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Flag, Lock, MapPin, MoreHorizontal, Share2, ShieldCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiClientError, newClientId } from '@/lib/api/client'
import { track } from '@/lib/analytics/client'
import type { Comment, HostOffer, Post, Seat } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { SeatRow } from './SeatRow'
import { ProgressiveImage } from './ProgressiveImage'
import { ReactionBar } from './ReactionBar'
import { Avatar, TripStub } from './PostCard'
import { ago, dateRange, nights, rupees } from './format'

const REASONS = [
  ['spam', 'Spam'], ['scam_money', 'Asking for money / scam'], ['harassment', 'Harassment'], ['unsafe_meetup', 'Unsafe meetup'],
  ['fake_profile', 'Fake profile'], ['hate', 'Hate'], ['sexual', 'Sexual content'], ['other', 'Something else'],
] as const

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
  const [stamp, setStamp] = useState<number | undefined>(undefined)
  const isPlan = post.kind === 'plan'

  useEffect(() => { track('screen.view', { kind: post.kind }, 'post_detail') }, [post.kind])

  function requireSignIn() {
    router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}${isPlan ? '?join=1' : ''}`)}`)
  }

  /** Optimistic: the viewer's seat is pencilled in as "requested" immediately. */
  async function sendJoin(intro: string) {
    const prev = post
    const seats: Seat[] = [...post.seats]
    const idx = seats.findIndex((s) => s.state === 'open')
    if (idx >= 0) seats[idx] = { state: 'requested', user: { id: viewerId ?? 'me', username: '', name: viewerName ?? 'You', avatarUrl: null, isPhoneVerified: true, isIdVerified: false, isHost: false } }
    setPost({ ...post, seats, viewer: { ...post.viewer, membership: 'requested', canJoin: false } })
    setStamp(idx)
    setJoinOpen(false)
    if (demo) { toast.success(`Request sent to ${post.author.name.split(' ')[0]}`); return }
    try {
      await apiFetch(`/posts/${post.id}/join`, { body: { intro } })
      toast.success(`Request sent. ${post.author.name.split(' ')[0]} usually replies within a day.`)
    } catch (e) {
      setPost(prev)
      if (e instanceof ApiClientError && e.code === 'phone_required') {
        toast.error('Verify your phone number to join plans')
        router.push('/settings#phone')
      } else toast.error((e as Error).message)
    }
  }

  async function withdraw() {
    const prev = post
    setPost({ ...post, seats: post.seats.map((s) => (s.state === 'requested' ? { state: 'open', user: null } : s)), viewer: { ...post.viewer, membership: null, canJoin: true } })
    if (demo) return
    try { await apiFetch(`/posts/${post.id}/join`, { method: 'DELETE' }) } catch (e) { setPost(prev); toast.error((e as Error).message) }
  }

  async function addComment(body: string, parentId: string | null, pollChoice?: string) {
    if (!signedIn) return requireSignIn()
    const clientId = newClientId()
    const temp: Comment = { id: `tmp-${clientId}`, postId: post.id, parentId, author: { id: viewerId ?? '', username: '', name: viewerName ?? 'You', avatarUrl: null, isPhoneVerified: true, isIdVerified: false, isHost: false }, body, pollChoice: null, createdAt: new Date().toISOString(), replies: [] }
    const apply = (c: Comment, replace?: string) => setComments((cs) => {
      if (!parentId) return replace ? cs.map((x) => (x.id === replace ? c : x)) : [...cs, c]
      return cs.map((x) => (x.id === parentId ? { ...x, replies: replace ? x.replies.map((r) => (r.id === replace ? c : r)) : [...x.replies, c] } : x))
    })
    apply(temp)
    if (demo) return
    try {
      const saved = await apiFetch<Comment>(`/posts/${post.id}/comments`, { body: { clientId, body, parentId, pollChoice } })
      apply(saved, temp.id)
    } catch (e) {
      setComments((cs) => cs.filter((x) => x.id !== temp.id).map((x) => ({ ...x, replies: x.replies.filter((r) => r.id !== temp.id) })))
      toast.error((e as Error).message)
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
    if (!confirm(`Block ${post.author.name}? You won't see each other's posts or messages.`)) return
    if (!demo) await apiFetch('/blocks', { body: { userId: post.author.id } }).catch((e) => toast.error(e.message))
    toast.success(`${post.author.name} is blocked`)
    router.push('/tribe')
  }

  async function share() {
    const url = `${location.origin}/tribe/p/${post.id}`
    const text = isPlan ? `${post.author.name.split(' ')[0]} needs ${Math.max((post.spotsTotal ?? 0) - post.memberCount, 0)} for ${post.place?.name} — on UnSOLO` : post.title ?? 'On UnSOLO'
    track('share.plan', { channel: 'navigator' in window && 'share' in navigator ? 'native' : 'copy' })
    if (navigator.share) await navigator.share({ title: text, url }).catch(() => undefined)
    else { await navigator.clipboard.writeText(url); toast.success('Link copied') }
  }

  const open = Math.max((post.spotsTotal ?? 0) - post.memberCount, 0)
  const n = nights(post.startsOn, post.endsOn)

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-4 pb-32 pt-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:pt-8">
      <main className="min-w-0">
        <nav className="mb-3 text-sm"><Link href="/tribe" className="pc-link">← Tribe</Link></nav>
        <article className={cn(isPlan ? 'pc-pencilled' : 'pc-surface', 'overflow-hidden')}>
          {post.media.length > 0 && (
            <div className={cn('grid gap-0.5', post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {post.media.map((m, i) => <ProgressiveImage key={i} media={m} alt={post.title ?? 'Photo'} className={post.media.length === 1 ? 'aspect-[4/3]' : 'aspect-square'} priority={i === 0} />)}
            </div>
          )}
          <div className="p-4 sm:p-6">
            {isPlan && <p className="pc-kicker mb-3">Community plan · not a booking{post.audience === 'women' ? ' · women only' : post.audience === 'verified' ? ' · verified only' : ''}</p>}
            <div className="flex items-start gap-3">
              <Avatar user={post.author} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/profile/${post.author.username}`} className="font-semibold hover:underline">{post.author.name}</Link>
                  {post.author.isIdVerified && <span className="inline-flex items-center gap-1 text-xs text-[color:var(--pc-green)]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> ID verified</span>}
                  {isPlan && <span className="pc-tag pc-tag-organiser">Organiser</span>}
                </div>
                <p className="text-[13px] text-muted-foreground">{ago(post.createdAt)} ago{post.place ? ` · ${post.place.name}` : ''}</p>
              </div>
              <div className="relative">
                <button type="button" className="pc-iconbtn" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal className="h-5 w-5" /></button>
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-20 w-52 rounded-md border border-border bg-popover py-1 shadow-sm" role="menu">
                    <button role="menuitem" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-accent" onClick={() => { setMenuOpen(false); void share() }}><Share2 className="h-4 w-4" /> Share</button>
                    {!post.viewer.isAuthor && <>
                      <button role="menuitem" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-accent" onClick={() => { setMenuOpen(false); if (signedIn) setReportOpen(true); else requireSignIn() }}><Flag className="h-4 w-4" /> Report</button>
                      <button role="menuitem" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-destructive hover:bg-accent" onClick={() => (signedIn ? block() : requireSignIn())}><UserX className="h-4 w-4" /> Block {post.author.name.split(' ')[0]}</button>
                    </>}
                  </div>
                )}
              </div>
            </div>

            <h1 className="mt-4 text-[28px] leading-tight sm:text-[32px]">{post.title ?? (post.kind === 'ask' ? post.body : post.place?.name)}</h1>

            {isPlan && (
              <dl className="mt-4 grid grid-cols-3 border-y border-dashed border-[color:var(--pc-rule2)] py-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Where</dt><dd className="font-medium"><MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden />{post.place?.name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">When</dt><dd className="font-medium"><CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden />{dateRange(post.startsOn, post.endsOn)}{n ? <span className="pc-mono text-muted-foreground"> · {n}N</span> : null}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Spots</dt><dd className="pc-mono font-semibold">{open} open of {post.spotsTotal}</dd></div>
              </dl>
            )}
            {(post.kind !== 'ask' || post.title) && <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed">{post.body}</p>}
            {isPlan && post.estCostText && <p className="mt-3 text-sm text-muted-foreground">{post.estCostText}. No money is paid through UnSOLO for community plans.</p>}
            {post.poll && <Poll post={post} signedIn={signedIn} demo={demo} onVote={(choice) => addComment(`Voted: ${post.poll!.options.find((o) => o.id === choice)?.label}`, null, choice)} />}
            {post.trip && <TripStub trip={post.trip} />}

            {isPlan && (
              <section className="mt-6" aria-label="Who's going">
                <h2 className="mb-2 text-lg">Who&apos;s going</h2>
                <SeatRow seats={post.seats} stampIndex={stamp} />
                <p className="mt-2 text-xs text-muted-foreground">Group size includes the organiser.</p>
              </section>
            )}
            <div className="mt-6"><ReactionBar post={post} signedIn={signedIn} demo={demo} /></div>
          </div>
        </article>

        <Comments comments={comments} onAdd={addComment} signedIn={signedIn} isAsk={post.kind === 'ask'} />
      </main>

      {/* Join / status panel: sticky side panel on desktop, bottom bar on mobile */}
      {isPlan && (
        <aside className="lg:block">
          <div className="pc-pencilled fixed inset-x-0 bottom-[64px] z-30 rounded-none border-x-0 border-b-0 bg-background px-4 py-3 md:bottom-0 lg:sticky lg:top-24 lg:rounded-md lg:border lg:p-4">
            {post.viewer.isAuthor ? (
              <OrganiserPanel post={post} offers={offers} demo={demo} />
            ) : post.viewer.membership === 'approved' ? (
              <div>
                <p className="font-semibold">You&apos;re in.</p>
                <p className="mt-1 text-sm text-muted-foreground"><Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden />Meeting point: {post.meetingPoint ?? 'the organiser will share it in the plan chat'}</p>
                <Link href="/bookings" className="pc-btn pc-btn-block mt-3">Open plan chat</Link>
                <OffersList offers={offers} demo={demo} canDecide={false} />
              </div>
            ) : post.viewer.membership === 'requested' ? (
              <div className="flex items-center justify-between gap-3 lg:block">
                <div>
                  <p className="font-semibold">Seat requested</p>
                  <p className="mt-1 hidden text-sm text-muted-foreground lg:block">Pencilled in until {post.author.name.split(' ')[0]} replies. Requests expire after 72 hours.</p>
                  <p className="text-xs text-muted-foreground lg:hidden">Waiting for {post.author.name.split(' ')[0]} · expires in 72 h</p>
                </div>
                <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm shrink-0 lg:mt-3 lg:w-full" onClick={withdraw}>Withdraw</button>
              </div>
            ) : (
              <div>
                <div className="hidden lg:block">
                  <p className="font-semibold">{open > 0 ? `${open} ${open === 1 ? 'spot' : 'spots'} open` : 'This plan is full'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Joining is by request. Say hi and {post.author.name.split(' ')[0]} decides. The exact meeting point and the plan chat open after you&apos;re approved.</p>
                </div>
                <button type="button" className="pc-btn pc-btn-outline pc-btn-block lg:mt-3"
                  disabled={!post.viewer.canJoin && signedIn}
                  onClick={() => (signedIn ? setJoinOpen(true) : requireSignIn())}>
                  {joinLabel(post)}
                </button>
                <Link href={`/?q=${encodeURIComponent(post.place?.name ?? '')}`} className="pc-link mt-3 hidden text-sm lg:block">Hosted {post.place?.name} trips on similar dates →</Link>
              </div>
            )}
          </div>
        </aside>
      )}

      {joinOpen && <JoinSheet post={post} onClose={() => setJoinOpen(false)} onSend={sendJoin} />}
      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} onSend={report} />}
    </div>
  )
}

function joinLabel(post: Post) {
  switch (post.viewer.joinBlockedReason) {
    case 'full': return 'Plan is full'
    case 'women_only': return 'Women-only plan (ID verified)'
    case 'verified_only': return 'Verified travellers only'
    case 'phone_required': return 'Verify your phone to join'
    case 'closed': return 'This plan is closed'
    default: return 'Ask to join'
  }
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    ref.current?.querySelector<HTMLElement>('textarea, input, select, button')?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-t-lg border border-foreground bg-background p-5 md:rounded-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function JoinSheet({ post, onClose, onSend }: { post: Post; onClose: () => void; onSend: (intro: string) => void }) {
  const [intro, setIntro] = useState('')
  const ok = intro.trim().length >= 10
  return (
    <Sheet title={`Ask ${post.author.name.split(' ')[0]} to join`} onClose={onClose}>
      <p className="mt-1 text-sm text-muted-foreground">A short hello helps: where you&apos;ve travelled, why this plan. Your phone number stays private.</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="intro">Say hi</label>
      <textarea id="intro" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={500} rows={4}
        className="mt-1 w-full rounded-md border bg-card p-3 text-[15px]" placeholder="Hi! Did Hampta Pass last year, very flexible on dates…" />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{ok ? 'Looks good' : 'At least 10 characters'}</span><span className="pc-mono">{intro.length}/500</span></div>
      <p className="mt-3 text-xs text-muted-foreground">Meet first in a public place. You can share the plan with someone you trust.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="pc-btn flex-1" disabled={!ok} onClick={() => onSend(intro.trim())}>Send request</button>
        <button type="button" className="pc-btn pc-btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

function ReportSheet({ onClose, onSend }: { onClose: () => void; onSend: (reason: string, details: string) => void }) {
  const [reason, setReason] = useState<string>('')
  const [details, setDetails] = useState('')
  return (
    <Sheet title="Report this post" onClose={onClose}>
      <fieldset className="mt-3 space-y-1">
        <legend className="sr-only">Reason</legend>
        {REASONS.map(([id, label]) => (
          <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-accent">
            <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} /> {label}
          </label>
        ))}
      </fieldset>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} placeholder="Anything we should know? (optional)" className="mt-2 w-full rounded-md border bg-card p-3 text-sm" />
      <div className="mt-4 flex gap-2">
        <button type="button" className="pc-btn flex-1" disabled={!reason} onClick={() => onSend(reason, details)}>Send report</button>
        <button type="button" className="pc-btn pc-btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

function Poll({ post, signedIn, demo, onVote }: { post: Post; signedIn: boolean; demo: boolean; onVote: (choice: string) => void }) {
  const [poll, setPoll] = useState(post.poll!)
  const total = poll.options.reduce((s, o) => s + o.votes, 0)
  function vote(id: string) {
    if (!signedIn || poll.myChoice) return
    setPoll({ myChoice: id, options: poll.options.map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o)) })
    if (!demo) onVote(id)
  }
  return (
    <ul className="mt-4 space-y-2" aria-label="Poll">
      {poll.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0
        return (
          <li key={o.id}>
            <button type="button" onClick={() => vote(o.id)} disabled={!!poll.myChoice || !signedIn} aria-pressed={poll.myChoice === o.id}
              className="relative min-h-11 w-full overflow-hidden rounded-md border border-border text-left">
              <span className="absolute inset-y-0 left-0 bg-[color:var(--pc-ink)]/10" style={{ width: poll.myChoice ? `${pct}%` : 0 }} aria-hidden />
              <span className="relative flex items-center justify-between px-3 py-2.5 text-[15px]">
                <span className={cn(poll.myChoice === o.id && 'font-semibold')}>{o.label}</span>
                {poll.myChoice && <span className="pc-mono text-sm text-muted-foreground">{pct}%</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Comments({ comments, onAdd, signedIn, isAsk }: { comments: Comment[]; onAdd: (body: string, parentId: string | null) => void; signedIn: boolean; isAsk: boolean }) {
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  return (
    <section id="comments" className="mt-8" aria-label={isAsk ? 'Answers' : 'Replies'}>
      <h2 className="text-xl">{isAsk ? 'Answers' : 'Replies'} <span className="pc-mono text-base text-muted-foreground">{comments.reduce((n, c) => n + 1 + c.replies.length, 0)}</span></h2>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) { onAdd(body.trim(), null); setBody('') } }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={signedIn ? (isAsk ? 'Share what you know…' : 'Add a reply…') : 'Sign in to reply'} disabled={!signedIn}
          className="min-h-11 flex-1 rounded-md border bg-card px-3 text-[15px]" aria-label="Your reply" />
        <button className="pc-btn" disabled={!body.trim()}>Post</button>
      </form>
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {comments.map((c) => (
          <li key={c.id} id={`c-${c.id}`} className="py-4">
            <CommentRow c={c} />
            <div className="ml-12 mt-1">
              <button type="button" className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>Reply</button>
            </div>
            {c.replies.length > 0 && (
              <ul className="ml-12 mt-1 space-y-3 border-l border-border pl-4">
                {c.replies.map((r) => <li key={r.id} id={`c-${r.id}`}><CommentRow c={r} small /></li>)}
              </ul>
            )}
            {replyTo === c.id && (
              <form className="ml-12 mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) { onAdd(replyBody.trim(), c.id); setReplyBody(''); setReplyTo(null) } }}>
                <input autoFocus value={replyBody} onChange={(e) => setReplyBody(e.target.value)} maxLength={2000} placeholder={`Reply to ${c.author.name.split(' ')[0]}`} className="min-h-11 flex-1 rounded-md border bg-card px-3 text-sm" />
                <button className="pc-btn pc-btn-sm" disabled={!replyBody.trim()}>Reply</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommentRow({ c, small }: { c: Comment; small?: boolean }) {
  return (
    <div className={cn('flex gap-3', c.id.startsWith('tmp-') && 'opacity-60')}>
      <Avatar user={c.author} size={small ? 28 : 36} />
      <div className="min-w-0">
        <p className="text-sm"><span className="font-semibold">{c.author.name}</span> <span className="text-muted-foreground">· {c.id.startsWith('tmp-') ? 'sending…' : ago(c.createdAt)}</span></p>
        <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed">{c.body}</p>
      </div>
    </div>
  )
}

function OrganiserPanel({ post, offers, demo }: { post: Post; offers: HostOffer[]; demo: boolean }) {
  const [requests, setRequests] = useState<{ user: { id: string; name: string; tripsCount: number; reviewsAvg: number | null; mutuals: number }; intro: string; state: string }[] | null>(demo ? [] : null)
  useEffect(() => {
    if (demo) return
    apiFetch<{ items: NonNullable<typeof requests> }>(`/posts/${post.id}/requests`).then((r) => setRequests(r.items)).catch(() => setRequests([]))
  }, [post.id, demo])
  async function decide(userId: string, decision: 'approve' | 'decline') {
    setRequests((rs) => rs?.map((r) => (r.user.id === userId ? { ...r, state: decision === 'approve' ? 'approved' : 'declined' } : r)) ?? null)
    try { await apiFetch(`/posts/${post.id}/requests/${userId}`, { body: { decision } }) } catch (e) { toast.error((e as Error).message) }
  }
  const pending = requests?.filter((r) => r.state === 'requested') ?? []
  return (
    <div>
      <p className="font-semibold">Your plan</p>
      <p className="mt-1 text-sm text-muted-foreground">{pending.length ? `${pending.length} ${pending.length === 1 ? 'request' : 'requests'} waiting` : 'No requests waiting'}</p>
      <ul className="mt-2 max-h-72 space-y-3 overflow-y-auto">
        {pending.map((r) => (
          <li key={r.user.id} className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold">{r.user.name}</p>
            <p className="pc-mono text-xs text-muted-foreground">{r.user.tripsCount} trips{r.user.reviewsAvg ? ` · ★ ${r.user.reviewsAvg}` : ''}{r.user.mutuals ? ` · ${r.user.mutuals} mutual` : ''}</p>
            <p className="mt-1 text-sm">“{r.intro}”</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="pc-btn pc-btn-sm flex-1" onClick={() => decide(r.user.id, 'approve')}>Approve</button>
              <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => decide(r.user.id, 'decline')}>Decline</button>
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
    if (!confirm(`Accept ${o.host.name}'s offer at ${rupees(o.pricePaise)} each? Your plan becomes a hosted trip and every member gets 48 hours to pay for their seat.`)) return
    if (demo) return
    try {
      const r = await apiFetch<{ packageSlug: string }>(`/offers/${o.id}/accept`, { method: 'POST' })
      router.push(`/packages/${r.packageSlug}`)
    } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="mt-4 border-t border-dashed border-[color:var(--pc-rule2)] pt-3">
      <p className="text-sm font-semibold">Hosts offering to run this</p>
      <ul className="mt-2 space-y-2">
        {pending.map((o) => (
          <li key={o.id} className="pc-printed p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{o.host.name} <span className="pc-tag pc-tag-host ml-1">Host</span></span>
              <span className="pc-mono font-semibold">{rupees(o.pricePaise)}</span>
            </div>
            {o.includes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{o.includes.join(' · ')}</p>}
            {canDecide && <button type="button" className="pc-btn pc-btn-sm pc-btn-block mt-2" onClick={() => accept(o)}>Accept offer</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
