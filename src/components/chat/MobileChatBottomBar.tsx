'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Home, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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
  statusHref = '/status',
}: {
  rooms: SidebarRoom[]
  /** /tribe or /community — same chat list, different theme. */
  basePath: string
  homeHref?: string
  statusHref?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  // Only render when the user is *inside* a room — on the list page the
  // sidebar/list IS the chat surface, so the bar would be redundant.
  const onRoomPage = pathname ? new RegExp(`^${basePath}/[^/]+`).test(pathname) : false

  // Live presence: same poll-pattern the sidebar uses (user_presence rows
  // last seen within the past two minutes count as online). Refreshes every
  // minute so the green dot stays roughly accurate without spamming Supabase.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!onRoomPage) return
    const supabase = createClient()
    let cancelled = false
    async function poll() {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('user_presence')
        .select('user_id')
        .eq('is_online', true)
        .gte('last_seen', twoMinAgo)
      if (cancelled || !data) return
      setOnlineUserIds(new Set((data as { user_id: string }[]).map(r => r.user_id)))
    }
    poll()
    const interval = setInterval(poll, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [onRoomPage])

  if (!onRoomPage) return null
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
      className={
        'md:hidden fixed inset-x-2 bottom-2 z-[55] rounded-2xl border border-white/12 ' +
        'bg-[color-mix(in_oklab,#0a0f14_82%,transparent)] backdrop-blur-2xl backdrop-saturate-150 ' +
        'shadow-[0_18px_48px_rgba(0,0,0,0.36)] ' +
        'supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.25rem)]'
      }
      aria-label="Chat navigation"
    >
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1.5">
        <Link
          href={homeHref}
          prefetch={false}
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-white/80 hover:bg-white/5 hover:text-white"
          aria-label="Home"
        >
          <Home className="h-5 w-5 stroke-[2]" />
          <span className="text-[9px] leading-none">Home</span>
        </Link>

        <div className="h-9 w-px bg-white/10" aria-hidden />

        {/* Recent chats — horizontally scrollable avatar strip with golden ring
            for active status + green dot for online (parity with the look the
            user pinned in the design). */}
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2.5 px-1">
            {sortedRooms.length === 0 ? (
              <p className="px-2 text-[11px] text-white/55">No recent chats yet</p>
            ) : (
              sortedRooms.map(r => {
                const partner = r.dmProfile
                const label = partner ? partner.full_name || partner.username : r.name
                const img = partner?.avatar_url || r.tripImage || r.communityImage || ''
                const isCurrent = pathname?.startsWith(`${basePath}/${r.id}`)
                const hasUnseenStatus = r.dmHasActiveStatus && !r.dmStatusSeen
                const isOnline = !!partner?.id && onlineUserIds.has(partner.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => router.push(`${basePath}/${r.id}`)}
                    className="relative flex shrink-0 items-center justify-center outline-none"
                    aria-label={`Open chat with ${label}`}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    <span
                      className={
                        'inline-flex h-11 w-11 items-center justify-center rounded-full transition ' +
                        (hasUnseenStatus
                          ? 'p-[2px] bg-gradient-to-tr from-primary via-amber-300 to-primary'
                          : isCurrent
                            ? 'p-[2px] bg-white/30'
                            : 'p-[1px] bg-white/10')
                      }
                    >
                      <Avatar className="h-full w-full border-[2px] border-zinc-950">
                        <AvatarImage src={img} alt={label} />
                        <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
                          {getInitials(label)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                    {/* Online dot — only on DM rooms (group/community rooms
                        don't have a single "online" partner). Tucked into
                        the bottom-right of the avatar with a dark ring so it
                        reads against any avatar background. */}
                    {isOnline ? (
                      <span
                        className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950"
                        aria-label="Online"
                      />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="h-9 w-px bg-white/10" aria-hidden />

        <Link
          href={statusHref}
          prefetch={false}
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-white/80 hover:bg-white/5 hover:text-white"
          aria-label="Statuses"
        >
          <Users className="h-5 w-5 stroke-[2]" />
          <span className="text-[9px] leading-none">Status</span>
        </Link>
      </div>
    </nav>
  )
}
