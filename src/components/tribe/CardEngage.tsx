'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiClientError, newClientId } from '@/lib/api/client'
import { useTextDraft } from '@/lib/drafts'
import { useAuth } from '@/components/layout/AuthProvider'
import type { Comment, Post, UserLite } from '@/lib/tribe/models'
import { ReactionBar } from './ReactionBar'
import { CommentRow } from './CommentRow'

const SHOWN = 3
const firstName = (u: { name: string }) => u.name.split(' ')[0]

/**
 * A feed card's reactions row plus its replies, opened in place: tapping the comment icon (or
 * Answer) shows the latest replies and a reply box right under the card, with no page change.
 * The reply box keeps a draft, so a half-written reply survives signing in.
 */
export function CardEngage({ post, signedIn, demo, compact, showSave, answerButton }: {
  post: Post
  signedIn: boolean
  demo?: boolean
  compact?: boolean
  showSave?: boolean
  answerButton?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [closed, setClosed] = useState(false)
  const [count, setCount] = useState(post.commentCount)
  const [draft] = useTextDraft(`comment.${post.id}`)
  // A reply left unsent (e.g. before signing in) reopens its card.
  const shown = open || (!!draft.trim() && !closed)
  const toggle = () => { if (shown) { setOpen(false); setClosed(true) } else { setOpen(true); setClosed(false) } }
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ReactionBar post={{ ...post, commentCount: count }} signedIn={signedIn} demo={demo} compact={compact} showSave={showSave}
            onComment={toggle} commentExpanded={shown} />
        </div>
        {answerButton && !shown && <button type="button" className="pc-btn pc-btn-sm pc-btn-quiet shrink-0" onClick={toggle}>Answer</button>}
      </div>
      {shown && <InlineComments post={post} signedIn={signedIn} demo={demo} onAdded={() => setCount((c) => c + 1)} />}
    </>
  )
}

function InlineComments({ post, signedIn, demo, onAdded }: { post: Post; signedIn: boolean; demo?: boolean; onAdded: () => void }) {
  const router = useRouter()
  const { profile } = useAuth()
  const [comments, setComments] = useState<Comment[] | null>(demo ? [] : null)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [body, setBody] = useTextDraft(`comment.${post.id}`)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isAsk = post.kind === 'ask'

  useEffect(() => {
    if (demo) return
    const ac = new AbortController()
    apiFetch<{ items: Comment[] }>(`/posts/${post.id}/comments`, { signal: ac.signal })
      .then((r) => setComments(r.items))
      .catch(() => { if (!ac.signal.aborted) setComments([]) })
    return () => ac.abort()
  }, [post.id, demo])

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])

  const me: UserLite = {
    id: profile?.id ?? 'me', username: profile?.username ?? '', name: profile?.full_name || profile?.username || 'You',
    avatarUrl: profile?.avatar_url ?? null, isPhoneVerified: true, isIdVerified: false, isHost: false,
  }

  function reply(c: Comment) {
    setReplyTo(c)
    const tag = `@${firstName(c.author)} `
    if (!body.startsWith(tag)) setBody(tag + body.replace(/^@\S+\s/, ''))
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text) return
    if (!signedIn) {
      // The words stay in the draft; this card reopens with them after sign-in.
      router.push(`/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    const parentId = replyTo ? (replyTo.parentId ?? replyTo.id) : null
    const clientId = newClientId()
    const temp: Comment = { id: `tmp-${clientId}`, postId: post.id, parentId, author: me, body: text, pollChoice: null, createdAt: new Date().toISOString(), replies: [] }
    const apply = (c: Comment, replace?: string) => setComments((cs) => {
      const list = cs ?? []
      if (!parentId) return replace ? list.map((x) => (x.id === replace ? c : x)) : [...list, c]
      return list.map((x) => (x.id === parentId ? { ...x, replies: replace ? x.replies.map((r) => (r.id === replace ? c : r)) : [...x.replies, c] } : x))
    })
    apply(temp)
    setBody('')
    setReplyTo(null)
    onAdded()
    if (demo) return
    try {
      apply(await apiFetch<Comment>(`/posts/${post.id}/comments`, { body: { clientId, body: text, parentId } }), temp.id)
    } catch (err) {
      setComments((cs) => (cs ?? []).filter((x) => x.id !== temp.id).map((x) => ({ ...x, replies: x.replies.filter((r) => r.id !== temp.id) })))
      setBody(text)
      if (!(err instanceof ApiClientError && err.code === 'phone_required')) toast.error((err as Error).message)
    }
  }

  const total = comments?.reduce((n, c) => n + 1 + c.replies.length, 0) ?? 0
  const latest = comments?.slice(-SHOWN) ?? []
  const hidden = comments ? comments.length - latest.length : 0

  return (
    <section className="mt-1 border-t border-[color:var(--pc-rule)] pt-2" aria-label={isAsk ? 'Answers' : 'Replies'}>
      {comments === null ? (
        <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading replies…</p>
      ) : (
        <>
          {hidden > 0 && (
            <Link href={`/tribe/p/${post.id}#comments`} className="pc-link mb-1 inline-block text-[13px]">View all {total} {isAsk ? 'answers' : 'replies'}</Link>
          )}
          {latest.length === 0 && <p className="py-1 text-[13px] text-muted-foreground">{isAsk ? 'No answers yet. Been there? Help them out.' : 'No replies yet. Say something kind.'}</p>}
          <ul>
            {latest.map((c) => (
              <li key={c.id}>
                <CommentRow c={c} post={post} onReply={() => reply(c)} />
                {c.replies.slice(-2).map((r) => <CommentRow key={r.id} c={r} post={post} reply onReply={() => reply(r)} />)}
              </li>
            ))}
          </ul>
        </>
      )}
      {replyTo && (
        <div className="fc-replying">
          <span>Replying to <b className="text-[color:var(--pc-ink)]">{replyTo.author.name}</b></span>
          <button type="button" className="pc-link" onClick={() => { setReplyTo(null); setBody(body.replace(/^@\S+\s/, '')) }}>Cancel</button>
        </div>
      )}
      <form className="mt-1.5 flex items-end gap-2" onSubmit={send}>
        <textarea ref={inputRef} rows={1} value={body} maxLength={2000} className="fc-composer-input" aria-label={isAsk ? 'Your answer' : 'Your reply'}
          placeholder={isAsk ? 'Share what you know…' : 'Add a reply…'}
          onChange={(e) => { setBody(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px` }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
        {signedIn
          ? <button type="submit" className="fc-send" disabled={!body.trim()} aria-label="Send"><SendHorizontal className="h-5 w-5" /></button>
          : <button type="submit" className="pc-btn pc-btn-sm mb-1 shrink-0" disabled={!body.trim()}>Sign in to send</button>}
      </form>
      {!signedIn && body.trim() && <p className="mt-1 px-1 text-[12px] text-muted-foreground">Saved on this device. It’ll be here after you sign in.</p>}
    </section>
  )
}
