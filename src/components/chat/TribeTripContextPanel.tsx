import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { isOptimizableImageUrl } from '@/lib/images/isOptimizableImageUrl'

type Member = { id: string; username: string; full_name: string | null; avatar_url: string | null }

/** Desktop-only side panel beside a trip chat so travellers don't leave the chat to check trip details. */
export function TribeTripContextPanel({
  title,
  slug,
  imageUrl,
  place,
  nextDepartureLine,
  members,
  hostUserId,
}: {
  title: string
  slug: string
  imageUrl: string | null
  place: string | null
  nextDepartureLine: string | null
  members: Member[]
  hostUserId: string | null
}) {
  const shown = members.slice(0, 8)
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/60 p-4 xl:flex">
      {imageUrl ? (
        <div className="relative h-36 overflow-hidden rounded-xl bg-muted">
          <Image src={imageUrl} alt="" fill sizes="288px" className="object-cover" unoptimized={!isOptimizableImageUrl(imageUrl)} />
        </div>
      ) : null}
      <div>
        <h3 className="text-base font-black leading-snug text-foreground">{title}</h3>
        {place ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{place}</p>
        ) : null}
        {nextDepartureLine ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{nextDepartureLine}</p>
        ) : null}
      </div>
      {slug ? (
        <Link href={`/packages/${slug}`} className="rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-semibold text-foreground hover:border-primary">
          View trip
        </Link>
      ) : null}
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {members.length} in this chat
        </h4>
        <ul className="mt-2 flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id}>
              <Link href={`/profile/${m.username}`} className="flex items-center gap-2 text-sm hover:underline">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={m.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-foreground">{getInitials(m.full_name || m.username)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-foreground">{m.full_name || m.username}</span>
                {m.id === hostUserId ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">Host</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        {members.length > shown.length ? (
          <p className="mt-2 text-xs text-muted-foreground">+{members.length - shown.length} more</p>
        ) : null}
      </div>
    </aside>
  )
}
