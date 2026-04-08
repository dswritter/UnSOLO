'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { appendRoomMessageToCache } from '@/lib/chat/appendRoomMessageCache'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials, timeAgo } from '@/lib/utils'
import { MessageCircle, Search, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotificationPrompt } from './NotificationPrompt'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { startDirectMessage } from '@/actions/profile'
import { toast } from 'sonner'
import { playNotificationSound, sendSystemNotification, preloadSound } from '@/lib/notifications/soundController'
import { SoundSettingsButton } from './SoundSettings'
import { DmSidebarAvatarMenu } from './DmSidebarAvatarMenu'

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
}

interface ChatSidebarProps {
  rooms: SidebarRoom[]
  activeRoomId?: string | null
  className?: string
  /** Current user id (for status viewer + menus) */
  viewerUserId: string
}

export function ChatSidebar({ rooms, activeRoomId, className = '', viewerUserId }: ChatSidebarProps) {
  const queryClient = useQueryClient()
  const [localRooms, setLocalRooms] = useState(rooms)
  const [search, setSearch] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'direct' | 'trip' | 'general'>('all')
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())
  const [userResults, setUserResults] = useState<{ id: string; username: string; full_name: string | null; avatar_url: string | null }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [startingDm, setStartingDm] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sidebarRealtimeId = useId().replace(/:/g, '')
  const localRoomsRef = useRef(localRooms)
  const currentActiveRoomRef = useRef<string | null>(null)

  const currentActiveRoom =
    activeRoomId || pathname?.match(/\/community\/([a-f0-9-]+)/i)?.[1] || null

  localRoomsRef.current = localRooms
  currentActiveRoomRef.current = currentActiveRoom

  // Sync with prop changes
  useEffect(() => { setLocalRooms(rooms) }, [rooms])

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

        setLocalRooms(prev => {
          const idx = prev.findIndex(r => normalizeRoomId(r.id) === msgRoom)
          if (idx === -1) return prev
          const updated = [...prev]
          updated[idx] = { ...updated[idx], lastMessage: msg.content, lastMessageAt: msg.created_at }
          const [moved] = updated.splice(idx, 1)
          return [moved, ...updated]
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

  // Clear unread when room becomes active
  useEffect(() => {
    if (currentActiveRoom) {
      setUnreadCounts(prev => {
        const next = new Map(prev)
        next.delete(currentActiveRoom)
        return next
      })
    }
  }, [currentActiveRoom])

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

  const filtered = localRooms.filter(r => {
    if (filter !== 'all' && r.type !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) || r.dmProfile?.username.toLowerCase().includes(q) || r.dmProfile?.full_name?.toLowerCase().includes(q) || r.tripLocation?.toLowerCase().includes(q)
    }
    return true
  })

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
      const existingDmUserIds = new Set(rooms.filter(r => r.type === 'direct' && r.dmProfile).map(r => r.dmProfile!.id))
      const rows = (data || []) as { id: string; username: string; full_name: string | null; avatar_url: string | null }[]
      setUserResults(rows.filter(u => !existingDmUserIds.has(u.id)))
      setSearchingUsers(false)
    }, 300)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search, rooms])

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-black">
            <span className="text-primary">Tribe</span> <span className="text-muted-foreground text-xs font-normal ml-1">Connect & Chat</span>
          </h2>
          <SoundSettingsButton />
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:border-primary"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {(['all', 'direct', 'trip', 'general'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-primary text-black'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              {f === 'all' ? 'All' : f === 'direct' ? 'DMs' : f === 'trip' ? 'Trips' : 'Community'}
            </button>
          ))}
        </div>
      </div>

      {/* Notification prompt */}
      <NotificationPrompt />

      {/* Room list — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && userResults.length === 0 && !searchingUsers ? (
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

            if (room.type === 'direct' && room.dmProfile) {
              const p = room.dmProfile
              return (
                <div
                  key={room.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 w-full ${
                    isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <DmSidebarAvatarMenu
                    avatarUrl={p.avatar_url}
                    fallbackName={p.full_name || p.username}
                    username={p.username}
                    userId={p.id}
                    hasStatus={room.dmHasActiveStatus === true}
                    online={dmOnline}
                    currentUserId={viewerUserId}
                  />
                  <button
                    type="button"
                    onClick={() => router.push(`/community/${room.id}`)}
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
              <button
                key={room.id}
                onClick={() => router.push(`/community/${room.id}`)}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 w-full text-left ${
                  isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {room.type === 'trip' && room.tripImage ? (
                    <div className="h-11 w-11 rounded-full overflow-hidden bg-secondary">
                      <img src={room.tripImage} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : room.type === 'general' && room.communityImage ? (
                    <div className="h-11 w-11 rounded-full overflow-hidden bg-secondary">
                      <img src={room.communityImage} alt="" className="h-full w-full object-cover" />
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
                    <span className="text-[10px] text-primary/60 font-medium">
                      {room.type === 'trip' ? 'Trip' : 'Community'}
                      {room.tripLocation ? ` · ${room.tripLocation}` : ''}
                    </span>
                  )}
                  {room.lastMessage && (
                    <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{room.lastMessage}</p>
                  )}
                </div>

                {unread > 0 ? (
                  <span className="h-5 min-w-[20px] px-1 bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : room.isMember === false ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">Join</span>
                ) : null}
              </button>
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
                      router.push(`/community/${result.roomId}`)
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
          </>
        )}
      </div>
    </div>
  )
}
