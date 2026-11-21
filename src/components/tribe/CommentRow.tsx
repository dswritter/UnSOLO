import type { Comment, Post } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { ago } from './format'

/** Highlights @mentions in a comment body. */
function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}\p{N}_.]+)/u)
  return <>{parts.map((p, i) => (p.startsWith('@') && p.length > 1 ? <span key={i} className="fc-mention">{p}</span> : p))}</>
}

export function CommentRow({ c, post, reply, onReply }: { c: Comment; post: Post; reply?: boolean; onReply: () => void }) {
  const pending = c.id.startsWith('tmp-')
  const isHost = c.author.isHost
  const isAuthor = c.author.id === post.author.id
  return (
    <div className={cn('fc-cmt', reply && 'is-reply', pending && 'opacity-60')}>
      <Avatar user={c.author} size={reply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className={cn('fc-bubble', isHost && 'is-host')}>
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <b className="text-[13px]">{c.author.name}</b>
            {isHost && <span className="pc-tag pc-tag-host fc-tag-sm">Host</span>}
            {isAuthor && !isHost && <span className="pc-tag pc-tag-organiser fc-tag-sm">{post.kind === 'plan' ? 'Organiser' : 'Author'}</span>}
          </div>
          <p className="whitespace-pre-line"><Mentions text={c.body} /></p>
        </div>
        <div className="fc-cmt-meta pl-1">
          <span className="inline-flex min-h-8 items-center">{pending ? 'sending…' : ago(c.createdAt)}</span>
          {!pending && <button type="button" onClick={onReply}>Reply</button>}
        </div>
      </div>
    </div>
  )
}
