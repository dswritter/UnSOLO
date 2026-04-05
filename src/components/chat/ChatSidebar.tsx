'use client'

import { useState, useEffect, useRef } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials, timeAgo } from '@/lib/utils'
import { MessageCircle, Search, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotificationPrompt } from './NotificationPrompt'
import { useRouter, usePathname } from 'next/navigation'
import { startDirectMessage } from '@/actions/profile'
import { toast } from 'sonner'

export interface SidebarRoom {
  id: string
  name: string
  type: 'trip' | 'direct' | 'general'
  lastMessage?: string
  lastMessageAt?: string
  dmProfile?: { username: string; full_name: string | null; avatar_url: string | null; id: string }
  tripImage?: string
  tripLocation?: string
  isMember?: boolean
}

interface ChatSidebarProps {
  rooms: SidebarRoom[]
  activeRoomId?: string | null
  className?: string
}

export function ChatSidebar({ rooms, activeRoomId, className = '' }: ChatSidebarProps) {
  const [search, setSearch] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'direct' | 'trip' | 'general'>('all')
  const [userResults, setUserResults] = useState<{ id: string; username: string; full_name: string | null; avatar_url: string | null }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [startingDm, setStartingDm] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Derive active room from URL if not passed
  const currentActiveRoom = activeRoomId || pathname?.match(/\/community\/([a-f0-9-]+)/i)?.[1] || null

  useEffect(() => {
    const supabase = createClient()
    async function checkPresence() {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await supabase.from('user_presence').select('user_id').eq('is_online', true).gte('last_seen', twoMinAgo)
      if (data) setOnlineUsers(new Set(data.map(d => d.user_id)))
    }
    checkPresence()
    const interval = setInterval(checkPresence, 15000)
    return () => clearInterval(interval)
  }, [])

  const filtered = rooms.filter(r => {
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
      setUserResults((data || []).filter(u => !existingDmUserIds.has(u.id)))
      setSearchingUsers(false)
    }, 300)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search, rooms])

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-lg font-black mb-3">
          <span className="text-primary">Tribe</span> <span className="text-muted-foreground text-xs font-normal ml-1">Connect & Chat</span>
        </h2>

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
            const isActive = currentActiveRoom === room.id

            return (
              <button
                key={room.id}
                onClick={() => {
                  // Use window.history to change URL without server navigation
                  window.history.pushState(null, '', `/community/${room.id}`)
                  // Dispatch popstate to notify React of URL change
                  window.dispatchEvent(new PopStateEvent('popstate'))
                }}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 w-full text-left ${
                  isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {room.type === 'direct' && room.dmProfile ? (
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={room.dmProfile.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                        {getInitials(room.dmProfile.full_name || room.dmProfile.username)}
                      </AvatarFallback>
                    </Avatar>
                  ) : room.type === 'trip' && room.tripImage ? (
                    <div className="h-11 w-11 rounded-full overflow-hidden bg-secondary">
                      <img src={room.tripImage} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center text-lg">
                      {room.type === 'trip' ? '🏔️' : room.type === 'direct' ? '👤' : '💬'}
                    </div>
                  )}
                  {room.type === 'direct' && dmOnline && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm truncate">{room.name}</span>
                    {room.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(room.lastMessageAt)}</span>
                    )}
                  </div>
                  {room.type !== 'direct' && (
                    <span className="text-[10px] text-primary/60 font-medium">
                      {room.type === 'trip' ? 'Trip' : 'Community'}
                      {room.tripLocation ? ` · ${room.tripLocation}` : ''}
                    </span>
                  )}
                  {room.lastMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{room.lastMessage}</p>
                  )}
                </div>

                {room.isMember === false && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">Join</span>
                )}
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
                      window.history.pushState(null, '', `/community/${result.roomId}`)
                      window.dispatchEvent(new PopStateEvent('popstate'))
                      setSearch('')
                    }
                    setStartingDm(null)
                  }}
                  disabled={startingDm === u.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors w-full text-left"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={u.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {getInitials(u.full_name || u.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.full_name || u.username}</div>
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
