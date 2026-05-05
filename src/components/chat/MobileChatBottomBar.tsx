'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'

/**
 * Bottom-bar specifically for the chat (Meet Travellers) section. Replaces
 * the global mobile bottom nav so the typing input has room and the chat
 * surface gets its own dedicated affordances:
 *
 *   [ Home ]  [horizontally-scrolling recent chat avatars]  [ Status ]
 *
 * Tapping an avatar jumps into that room. The Home button leaves the chat
 * section. Status leads to the home page where the status rail lives —
 * follow-up could replace this with a dedicated status sheet.
 */
export function MobileChatBottomBar({
  rooms,
  basePath,
  homeHref = '/',
  statusHref = '/?status=1',
}: {
  rooms: SidebarRoom[]
  /** /tribe or /community — same chat list, different theme. */
  basePath: string
  homeHref?: string
  statusHref?: string
}) {
  const router = useRouter()
  // Take the freshest 12 rooms — anything further is one tap away in the full list.
  const sortedRooms = [...rooms]
    .sort((a, b) => {
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bT - aT
    })
    .slice(0, 12)

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.4rem)]"
      aria-label="Chat navigation"
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <Link
          href={homeHref}
          prefetch={false}
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-semibold text-white/72 hover:text-white"
          aria-label="Home"
        >
          <Home className="h-4.5 w-4.5 stroke-[2]" />
          <span className="text-[9px]">Home</span>
        </Link>

        {/* Recent chats — horizontally scrollable avatar strip */}
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2 pr-2">
            {sortedRooms.length === 0 ? (
              <p className="px-2 text-[11px] text-white/55">No recent chats yet</p>
            ) : (
              sortedRooms.map(r => {
                const partner = r.dmProfile
                const label = partner ? partner.full_name || partner.username : r.name
                const img = partner?.avatar_url || r.tripImage || r.communityImage || ''
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => router.push(`${basePath}/${r.id}`)}
                    className="relative flex shrink-0 flex-col items-center gap-0.5 outline-none"
                    aria-label={`Open chat with ${label}`}
                  >
                    <Avatar className="h-9 w-9 border border-white/15 bg-secondary">
                      <AvatarImage src={img} alt={label} />
                      <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
                        {getInitials(label)}
                      </AvatarFallback>
                    </Avatar>
                    {r.dmHasActiveStatus && !r.dmStatusSeen ? (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-zinc-950" aria-hidden />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <Link
          href={statusHref}
          prefetch={false}
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-semibold text-white/72 hover:text-white"
          aria-label="Statuses"
        >
          <Users className="h-4.5 w-4.5 stroke-[2]" />
          <span className="text-[9px]">Status</span>
        </Link>
      </div>
    </nav>
  )
}
