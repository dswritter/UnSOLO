'use client'

import { useState, useEffect, useRef, useId, useMemo, type MouseEvent } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { appendRoomMessageToCache } from '@/lib/chat/appendRoomMessageCache'
import { prefetchRoomMessages } from '@/lib/chat/prefetchRoomMessages'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { pushWithRouteProgress } from '@/lib/navigation/pushWithRouteProgress'
import { getInitials, timeAgo } from '@/lib/utils'
import { MessageCircle, Search, UserPlus, ChevronDown, Loader2, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotificationPrompt } from './NotificationPrompt'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { startDirectMessage } from '@/actions/profile'
import { loadActiveSidebarRoom, toggleChatSidebarPin } from '@/actions/chat-sidebar'
import { fetchSidebarRoomPage } from '@/lib/chat/fetchSidebarRooms'
import { toast } from 'sonner'
import { playNotificationSound, sendSystemNotification, preloadSound } from '@/lib/notifications/soundController'
import { SoundSettingsButton } from './SoundSettings'
import { DmSidebarAvatarMenu } from './DmSidebarAvatarMenu'
import { prioritizeActiveConversation } from '@/lib/chat/sidebar-page'
import { CommunityIndexDesktopRedirect } from './CommunityIndexDesktopRedirect'
import { CommunityCrossRoomMessagePreview } from './CommunityCrossRoomMessagePreview'

function normalizeRoomId(id: string) {
  return id.trim().toLowerCase()
}

export interface SidebarRoom {
  id: string
  name: string
  type: 'trip' | 'direct' | 'general'
  lastMessage?: string
  lastMessageAt?: string
  dmProfile?: { username: string; full_name: string | null; avatar_url: string | null; id: string }
  tripImage?: string
  tripLocation?: string
  /** Cover image for community (general) rooms */
  communityImage?: string
  isMember?: boolean
  /** DM partner has at least one non-expired status story */
  dmHasActiveStatus?: boolean
  /** Current user has already seen all of the DM partner's active stories */
  dmStatusSeen?: boolean
}

function sortSidebarRooms(rooms: SidebarRoom[], pinnedIds: string[]): SidebarRoom[] {
  const pinRank = new Map<string, number>()
  pinnedIds.forEach((id, i) => pinRank.set(normalizeRoomId(id), i))
  return [...rooms].sort((a, b) => {
    const ra = pinRank.get(normalizeRoomId(a.id))
    const rb = pinRank.get(normalizeRoomId(b.id))
    const aPinned = ra !== undefined
    const bPinned = rb !== undefined
    if (aPinned && bPinned && ra !== rb) return ra - rb
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')
  })
}

interface ChatSidebarProps {
  rooms: SidebarRoom[]
  /** Total conversations (for pagination). Defaults to `rooms.length` (no "load more"). */
  totalRoomCount?: number
  pageSize?: number
  activeRoomId?: string | null
  initialActiveRoom?: SidebarRoom | null
  className?: string
  /** Current user id (for status viewer + menus) */
  viewerUserId: string
  /** Chat list + room URLs (default `/community`; use `/tribe` on the tribe shell) */
  basePath?: string
  /** Pinned room ids (most recently pinned first). */
  pinnedRoomIds?: string[]
  autoOpenRecent?: boolean
  showCrossRoomPreview?: boolean
}

const BACKGROUND_WARM_ROOMS = 8
const BACKGROUND_WARM_DELAY_MS = 1200
const EMPTY_PINNED_IDS: string[] = []

export function ChatSidebar({
  rooms,
  totalRoomCount: totalRoomCountProp,
  pageSize: _pageSize = 8,
  activeRoomId,
  initialActiveRoom = null,
  className = '',
  viewerUserId,
  basePath = '/community',
  pinnedRoomIds: pinnedRoomIdsProp = EMPTY_PINNED_IDS,
  autoOpenRecent = false,
  showCrossRoomPreview = false,
}: ChatSidebarProps) {
  const queryClient = useQueryClient()
  const [localRooms, setLocalRooms] = useState(rooms)
  const [activeRoomPreview, setActiveRoomPreview] = useState<SidebarRoom | null>(initialActiveRoom)
  const [localPinnedIds, setLocalPinnedIds] = useState(pinnedRoomIdsProp)
  const pinInFlightRef = useRef<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'direct' | 'trip' | 'general'>('all')
  const conversations = useInfiniteQuery({
    queryKey: ['chat-sidebar', viewerUserId, filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchSidebarRoomPage(pageParam, filter === 'all' ? undefined : filter),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.rooms.length, 0)
      return loaded < lastPage.total && lastPage.rooms.length ? loaded : undefined
    },
    initialData: filter === 'all' && totalRoomCountProp !== undefined ? {
      pages: [{ rooms, total: totalRoomCountProp, pinnedRoomIds: pinnedRoomIdsProp }],
      pageParams: [0],
    } : undefined,
    staleTime: 60_000,
  })
  const [lastPageData, setLastPageData] = useState<typeof conversations.data | undefined>(undefined)
  if (conversations.data !== lastPageData) {
    setLastPageData(conversations.data)
    if (conversations.data) {
      const incoming = conversations.data.pages.flatMap(page => page.rooms)
      setLocalRooms(previous => {
        const merged = new Map(previous.map(room => [room.id, room]))
        for (const room of incoming) {
          const current = merged.get(room.id)
          merged.set(room.id, current && (current.lastMessageAt ?? '') > (room.lastMessageAt ?? '')
            ? { ...room, lastMessage: current.lastMessage, lastMessageAt: current.lastMessageAt }
            : room)
        }
        return [...merged.values()]
      })
      setLocalPinnedIds(conversations.data.pages.at(-1)?.pinnedRoomIds ?? [])
    }
  }
  const pageRooms = useMemo(() => conversations.data?.pages.flatMap(page => page.rooms) ?? rooms, [conversations.data, rooms])
  const loadMoreLoading = conversations.isFetchingNextPage
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())
  const [userResults, setUserResults] = useState<{ id: string; username: string; full_name: string | null; avatar_url: string | null }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [startingDm, setStartingDm] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sidebarRealtimeId = useId().replace(/:/g, '')
  const localRoomsRef = useRef(localRooms)
  const localPinnedIdsRef = useRef(localPinnedIds)
  const currentActiveRoomRef = useRef<string | null>(null)

  const roomPathRe = useMemo(() => {
    const seg = basePath.replace(/^\//, '')
    return new RegExp(`/${seg}/([a-f0-9-]+)`, 'i')
  }, [basePath])
  const currentActiveRoom = activeRoomId || pathname?.match(roomPathRe)?.[1] || null

  localRoomsRef.current = activeRoomPreview?.id === currentActiveRoom && !localRooms.some(room => room.id === currentActiveRoom)
    ? [activeRoomPreview, ...localRooms]
    : localRooms
  localPinnedIdsRef.current = localPinnedIds
  currentActiveRoomRef.current = currentActiveRoom

  useEffect(() => {
    if (
      !currentActiveRoom ||
      conversations.isPending ||
      activeRoomPreview?.id === currentActiveRoom ||
      localRooms.some(room => room.id === currentActiveRoom)
    ) return
    let cancelled = false
    void loadActiveSidebarRoom(currentActiveRoom).then(result => {
      if (cancelled) return
      if (result.room) setActiveRoomPreview(result.room)
    }).catch((error: unknown) => {
      if (!cancelled) {
        console.error('Unable to load active sidebar conversation', error)
      }
    })
    return () => { cancelled = true }
  }, [currentActiveRoom, conversations.isPending, localRooms, activeRoomPreview])

  // Open room renders first; then warm the other conversations' messages one at a time.
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const active = currentActiveRoomRef.current ? normalizeRoomId(currentActiveRoomRef.current) : null
        if (!active) return
        await prefetchRoomMessages(queryClient, active)
        if (cancelled) return
        const ids = pageRooms.map(r => r.id).filter(id => normalizeRoomId(id) !== active).slice(0, BACKGROUND_WARM_ROOMS)
        for (const id of ids) {
          if (cancelled || document.visibilityState === 'hidden') return
          await prefetchRoomMessages(queryClient, id)
        }
      })()
    }, BACKGROUND_WARM_DELAY_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [pageRooms, queryClient])

  // Preload notification sound on first interaction
  useEffect(() => { preloadSound() }, [])

  // Realtime: unique channel per sidebar instance (desktop + mobile both mount)
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`sidebar-realtime-${sidebarRealtimeId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload: { new: Record<string, unknown> }) => {
        const msg = payload.new as { id: string; room_id: string; content: string; created_at: string; user_id: string; message_type: string }
        if (msg.message_type === 'system') return

        const msgRoom = normalizeRoomId(msg.room_id)
        const knownIds = new Set(localRoomsRef.current.map(r => normalizeRoomId(r.id)))
        if (!knownIds.has(msgRoom)) return

        appendRoomMessageToCache(queryClient, msg)
        window.dispatchEvent(new CustomEvent('unsolo:new-message', { detail: msg }))
        setActiveRoomPreview(prev => prev && normalizeRoomId(prev.id) === msgRoom
          ? { ...prev, lastMessage: msg.content, lastMessageAt: msg.created_at }
          : prev)

        setLocalRooms(prev => {
          const idx = prev.findIndex(r => normalizeRoomId(r.id) === msgRoom)
          if (idx === -1) return prev
          const lastPreview =
            msg.message_type === 'poll'
              ? `📊 ${msg.content.length > 100 ? msg.content.slice(0, 97) + '…' : msg.content}`
              : msg.content
          const updated = [...prev]
          updated[idx] = { ...updated[idx], lastMessage: lastPreview, lastMessageAt: msg.created_at }
          return sortSidebarRooms(updated, localPinnedIdsRef.current)
        })

        const active = currentActiveRoomRef.current
        const activeNorm = active ? normalizeRoomId(active) : null
        if (msgRoom !== activeNorm) {
          const room = localRoomsRef.current.find(r => normalizeRoomId(r.id) === msgRoom)
          const roomType = room?.type || 'general'
          let unreadBefore = 0

          setUnreadCounts(prevUnread => {
            unreadBefore = prevUnread.get(msg.room_id) || 0
            const next = new Map(prevUnread)
            next.set(msg.room_id, unreadBefore + 1)
            return next
          })

          queueMicrotask(() => {
            playNotificationSound({
              messageRoomId: msg.room_id,
              activeRoomId: active,
              roomType,
              unreadCount: unreadBefore,
              isTyping: false,
            })
            const senderName = room?.name || 'Someone'
            sendSystemNotification(
              `New message in ${senderName}`,
              msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content,
            )
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sidebarRealtimeId, queryClient])

  // Live updates when admins rename / disable community rooms
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`sidebar-chat-rooms-${sidebarRealtimeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_rooms' },
        (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old?.id as string | undefined
            if (id) {
              setLocalRooms(prev => prev.filter(r => normalizeRoomId(r.id) !== normalizeRoomId(id)))
            }
            return
          }
          const row = payload.new as { id?: string; name?: string; type?: string; is_active?: boolean; image_url?: string | null } | undefined
          if (!row?.id || row.type !== 'general') return
          const id = row.id
          const name = row.name || 'Chat'
          const active = row.is_active !== false
          const image_url = row.image_url
          setLocalRooms(prev => {
            const idx = prev.findIndex(r => normalizeRoomId(r.id) === normalizeRoomId(id))
            if (!active) {
              return prev.filter(r => normalizeRoomId(r.id) !== normalizeRoomId(id))
            }
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              name,
              communityImage: image_url || undefined,
            }
            return next
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sidebarRealtimeId])

  // Another session (e.g. phone) read messages — lower unread for that room
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`sidebar-read-sync-${sidebarRealtimeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
          filter: `user_id=eq.${viewerUserId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const r = payload.new as { user_id: string; message_id: string }
          if (r.user_id !== viewerUserId) return
          const { data: m } = await supabase.from('messages').select('room_id').eq('id', r.message_id).maybeSingle()
          const rid = (m as { room_id?: string } | null)?.room_id
          if (!rid) return
          setUnreadCounts(prev => {
            const next = new Map(prev)
            const cur = next.get(rid) || 0
            next.set(rid, Math.max(0, cur - 1))
            return next
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sidebarRealtimeId, viewerUserId])

  useEffect(() => {
    const supabase = createClient()
    async function checkPresence() {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await supabase.from('user_presence').select('user_id').eq('is_online', true).gte('last_seen', twoMinAgo)
      if (data) setOnlineUsers(new Set((data as { user_id: string }[]).map(d => d.user_id)))
    }
    checkPresence()
    const interval = setInterval(checkPresence, 60000)
    return () => clearInterval(interval)
  }, [])

  const filtered = useMemo(() => {
    const visibleRooms = activeRoomPreview?.id === currentActiveRoom && !localRooms.some(r => r.id === currentActiveRoom)
      ? [activeRoomPreview, ...localRooms]
      : localRooms
    const f = visibleRooms.filter(r => {
      if (filter !== 'all' && r.type !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return r.name.toLowerCase().includes(q) || r.dmProfile?.username.toLowerCase().includes(q) || r.dmProfile?.full_name?.toLowerCase().includes(q) || r.tripLocation?.toLowerCase().includes(q)
      }
      return true
    })
    const sorted = sortSidebarRooms(f, localPinnedIds)
    return prioritizeActiveConversation(sorted, currentActiveRoom)
  }, [localRooms, activeRoomPreview, currentActiveRoom, filter, search, localPinnedIds])

  const canLoadMore = conversations.hasNextPage && !search.trim()

  async function onLoadMore() {
    if (loadMoreLoading || !canLoadMore) return
    await conversations.fetchNextPage()
  }

  function handleTogglePin(e: MouseEvent<HTMLButtonElement>, roomId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (pinInFlightRef.current.has(roomId)) return
    const previousPins = localPinnedIds
    const norm = normalizeRoomId(roomId)
    const wasPinned = localPinnedIds.some(id => normalizeRoomId(id) === norm)
    const nextPins = wasPinned
      ? localPinnedIds.filter(id => normalizeRoomId(id) !== norm)
      : [roomId, ...localPinnedIds.filter(id => normalizeRoomId(id) !== norm)]
    setLocalPinnedIds(nextPins)
    setLocalRooms(prev => sortSidebarRooms(prev, nextPins))
    pinInFlightRef.current.add(roomId)
    void (async () => {
      try {
        const res = await toggleChatSidebarPin(roomId)
        if (res.error) {
          toast.error(res.error)
          setLocalPinnedIds(previousPins)
          setLocalRooms(previous => sortSidebarRooms(previous, previousPins))
          return
        }
        await queryClient.invalidateQueries({ queryKey: ['chat-sidebar', viewerUserId] })
        router.refresh()
      } finally {
        pinInFlightRef.current.delete(roomId)
      }
    })()
  }

  // Search platform users when no DM matches found
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!search.trim() || search.trim().length < 2) { setUserResults([]); return }

    // Only search users if we're on DMs filter or search has no results
    searchTimerRef.current = setTimeout(async () => {
      setSearchingUsers(true)
      const supabase = createClient()
      const q = search.trim()
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(5)

      // Filter out users who already have a DM in the rooms list
      const existingDmUserIds = new Set(localRooms.filter(r => r.type === 'direct' && r.dmProfile).map(r => r.dmProfile!.id))
      const rows = (data || []) as { id: string; username: string; full_name: string | null; avatar_url: string | null }[]
      setUserResults(rows.filter(u => !existingDmUserIds.has(u.id)))
      setSearchingUsers(false)
    }, 300)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search, localRooms])

  return (
    <div className={`flex flex-col ${className}`} role="region" aria-label="Your conversations">
      {autoOpenRecent && (
        <CommunityIndexDesktopRedirect roomId={conversations.data?.pages[0]?.mostRecentRoomId ?? pageRooms[0]?.id ?? null} listPath={basePath} roomPathPrefix={basePath} />
      )}
      {showCrossRoomPreview && (
        <CommunityCrossRoomMessagePreview viewerUserId={viewerUserId} rooms={conversations.data?.pages[0]?.roomNameIndex ?? []} basePath={basePath} />
      )}
      {/* Header: filter tabs only — search lives at the bottom */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 min-w-0">
            {(['all', 'direct', 'trip', 'general'] as const).map(f => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filter === f
                    ? 'bg-primary text-black'
                    : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {f === 'all' ? 'All' : f === 'direct' ? 'DMs' : f === 'trip' ? 'Trips' : 'Community'}
              </button>
            ))}
          </div>
          <SoundSettingsButton />
        </div>
      </div>

      {/* Notification prompt */}
      <NotificationPrompt />

      {/* Room list — scrollable */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain min-h-0">
        {conversations.isFetching && !loadMoreLoading && (
          <div role="status" className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversations…
          </div>
        )}
        {conversations.isError && (
          <div role="alert" className="px-4 py-3 text-xs text-destructive">
            Unable to load conversations.
            <button type="button" onClick={() => void conversations.refetch()} className="ml-2 underline">Retry</button>
          </div>
        )}
        {filtered.length === 0 && userResults.length === 0 && !searchingUsers && !conversations.isPending && !conversations.isError ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>No conversations found</p>
            {search.trim() && <p className="text-[10px] mt-1">Try searching by username or full name</p>}
          </div>
        ) : (
          <>
          {filtered.map(room => {
            const dmOnline = room.dmProfile ? onlineUsers.has(room.dmProfile.id) : false
            const isActive = !!currentActiveRoom && normalizeRoomId(currentActiveRoom) === normalizeRoomId(room.id)
            const unread = unreadCounts.get(room.id) || 0
            const isPinned = localPinnedIds.some(id => normalizeRoomId(id) === normalizeRoomId(room.id))

            if (room.type === 'direct' && room.dmProfile) {
              const p = room.dmProfile
              return (
                <div
                  key={room.id}
                  className={`flex items-center gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 w-full ${
                    isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <DmSidebarAvatarMenu
                    avatarUrl={p.avatar_url}
                    fallbackName={p.full_name || p.username}
                    username={p.username}
                    userId={p.id}
                    hasStatus={room.dmHasActiveStatus === true}
                    statusSeen={room.dmStatusSeen === true}
                    online={dmOnline}
                    currentUserId={viewerUserId}
                  />
                  <Link
                    href={`${basePath}/${room.id}`}
                    onMouseEnter={() => prefetchRoomMessages(queryClient, room.id)}
                    className="flex-1 min-w-0 text-left py-0"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Link
                        href={`/profile/${p.username}`}
                        onClick={e => e.stopPropagation()}
                        className={`font-medium text-sm truncate hover:text-primary hover:underline ${unread > 0 ? 'font-bold text-foreground' : ''}`}
                      >
                        {room.name}
                      </Link>
                      {room.lastMessageAt && (
                        <span className={`text-[10px] shrink-0 ${unread > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{timeAgo(room.lastMessageAt)}</span>
                      )}
                    </div>
                    {room.lastMessage && (
                      <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{room.lastMessage}</p>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={e => handleTogglePin(e, room.id)}
                    aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pin className={`h-3.5 w-3.5 ${isPinned ? 'text-primary' : ''}`} strokeWidth={isPinned ? 2.25 : 1.75} fill={isPinned ? 'currentColor' : 'none'} />
                  </button>
                  {unread > 0 ? (
                    <span className="h-5 min-w-[20px] px-1 bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </div>
              )
            }

            return (
              <div
                key={room.id}
                className={`flex items-center gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 w-full ${
                  isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                }`}
              >
                <Link
                  href={`${basePath}/${room.id}`}
                  onMouseEnter={() => prefetchRoomMessages(queryClient, room.id)}
                  className="flex flex-1 min-w-0 items-center gap-3 text-left"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {room.type === 'trip' && room.tripImage ? (
                      <div className="h-11 w-11 rounded-full overflow-hidden bg-secondary">
                        <img src={storageThumbnailUrl(room.tripImage) || room.tripImage} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : room.type === 'general' && room.communityImage ? (
                      <div className="h-11 w-11 rounded-full overflow-hidden bg-secondary">
                        <img src={storageThumbnailUrl(room.communityImage) || room.communityImage} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center text-lg">
                        {room.type === 'trip' ? '🏔️' : '💬'}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`font-medium text-sm truncate ${unread > 0 ? 'font-bold text-foreground' : ''}`}>{room.name}</span>
                      {room.lastMessageAt && (
                        <span className={`text-[10px] shrink-0 ${unread > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{timeAgo(room.lastMessageAt)}</span>
                      )}
                    </div>
                    {room.type !== 'direct' && (
                      <span className="text-[10px] font-medium">
                        <span className="text-primary">{room.type === 'trip' ? 'Trip' : 'Community'}</span>
                        {room.tripLocation ? <span className="text-muted-foreground"> · {room.tripLocation}</span> : null}
                      </span>
                    )}
                    {room.lastMessage && (
                      <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{room.lastMessage}</p>
                    )}
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={e => handleTogglePin(e, room.id)}
                  aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Pin className={`h-3.5 w-3.5 ${isPinned ? 'text-primary' : ''}`} strokeWidth={isPinned ? 2.25 : 1.75} fill={isPinned ? 'currentColor' : 'none'} />
                </button>

                {unread > 0 ? (
                  <span className="h-5 min-w-[20px] px-1 bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : room.isMember === false ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">Join</span>
                ) : null}
              </div>
            )
          })}

          {/* User search results — start new DM */}
          {search.trim() && userResults.length > 0 && (
            <div className="border-t border-border pt-2 mt-1">
              <p className="px-4 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Start a conversation</p>
              {userResults.map(u => (
                <button
                  key={u.id}
                  onClick={async () => {
                    setStartingDm(u.id)
                    const result = await startDirectMessage(u.id)
                    if (result.error) { toast.error(result.error); setStartingDm(null); return }
                    if (result.roomId) {
                      pushWithRouteProgress(router, `${basePath}/${result.roomId}`)
                      setSearch('')
                    }
                    setStartingDm(null)
                  }}
                  disabled={startingDm === u.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors w-full text-left"
                >
                  <a href={`/profile/${u.username}`} onClick={e => e.stopPropagation()} className="shrink-0">
                    <Avatar className="h-9 w-9 hover:ring-2 hover:ring-primary/40 transition-all">
                      <AvatarImage src={u.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {getInitials(u.full_name || u.username)}
                      </AvatarFallback>
                    </Avatar>
                  </a>
                  <div className="flex-1 min-w-0">
                    <a href={`/profile/${u.username}`} onClick={e => e.stopPropagation()} className="text-sm font-medium truncate hover:text-primary transition-colors block">{u.full_name || u.username}</a>
                    <div className="text-[10px] text-muted-foreground">@{u.username}</div>
                  </div>
                  {startingDm === u.id ? (
                    <span className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <UserPlus className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
          {searchingUsers && (
            <div className="px-4 py-3 text-center">
              <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />
            </div>
          )}
          {canLoadMore && !searchingUsers && (
            <div className="px-4 py-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => void onLoadMore()}
                disabled={loadMoreLoading}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadMoreLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Load more conversations
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* Search — sticky at bottom so filters + conversations start at the top */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search people and chats"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:border-primary"
            aria-label="Search people and chats"
          />
        </div>
      </div>
    </div>
  )
}
