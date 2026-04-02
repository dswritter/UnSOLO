'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials, timeAgo } from '@/lib/utils'
import { MessageCircle, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  unreadCount?: number
}

interface ChatSidebarProps {
  rooms: SidebarRoom[]
  activeRoomId?: string | null
  className?: string
  /** If provided, clicking a room calls this instead of navigating */
  onRoomSelect?: (roomId: string) => void
}

export function ChatSidebar({ rooms, activeRoomId, className = '', onRoomSelect }: ChatSidebarProps) {
  const [search, setSearch] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'direct' | 'trip' | 'general'>('all')

  // Poll online status
  useEffect(() => {
    const supabase = createClient()

    async function checkPresence() {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('user_presence')
        .select('user_id')
        .eq('is_online', true)
        .gte('last_seen', twoMinAgo)
      if (data) setOnlineUsers(new Set(data.map(d => d.user_id)))
    }

    checkPresence()
    const interval = setInterval(checkPresence, 15000)
    return () => clearInterval(interval)
  }, [])

  // Filter rooms
  const filtered = rooms.filter(r => {
    if (filter !== 'all' && r.type !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) ||
        r.dmProfile?.username.toLowerCase().includes(q) ||
        r.tripLocation?.toLowerCase().includes(q)
    }
    return true
  })

  function isOnline(userId?: string) {
    return userId ? onlineUsers.has(userId) : false
  }

  function handleClick(e: React.MouseEvent, roomId: string) {
    if (onRoomSelect) {
      e.preventDefault()
      onRoomSelect(roomId)
    }
    // If no onRoomSelect, let the <a> navigate normally
  }

  return (
    <div className={`flex flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-lg font-black mb-3">
          <span className="text-primary">Community</span>
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
        <div className="flex gap-1">
          {(['all', 'direct', 'trip', 'general'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f === 'direct' ? 'DMs' : f === 'trip' ? 'Trips' : 'Community'}
            </button>
          ))}
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>No conversations found</p>
          </div>
        ) : (
          filtered.map(room => {
            const dmOnline = room.dmProfile ? isOnline(room.dmProfile.id) : false
            const isActive = activeRoomId === room.id
            const hasUnread = (room.unreadCount || 0) > 0 && !isActive

            return (
              <a
                key={room.id}
                href={`/community?room=${room.id}`}
                onClick={(e) => handleClick(e, room.id)}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/30 cursor-pointer ${
                  isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                } ${hasUnread ? 'bg-primary/5' : ''}`}
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
                  {/* Online indicator for DMs */}
                  {room.type === 'direct' && dmOnline && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`font-medium text-sm truncate ${hasUnread ? 'text-foreground font-bold' : ''}`}>{room.name}</span>
                    {room.lastMessageAt && (
                      <span className={`text-[10px] shrink-0 ${hasUnread ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                        {timeAgo(room.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  {room.type !== 'direct' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-primary/60 font-medium">
                        {room.type === 'trip' ? 'Trip' : 'Community'}
                        {room.tripLocation ? ` · ${room.tripLocation}` : ''}
                      </span>
                    </div>
                  )}
                  {room.lastMessage && (
                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {room.lastMessage}
                    </p>
                  )}
                </div>

                {/* Unread badge or Join badge */}
                {hasUnread ? (
                  <span className="h-5 min-w-[20px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {room.unreadCount! > 99 ? '99+' : room.unreadCount}
                  </span>
                ) : room.isMember === false ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                    Join
                  </span>
                ) : null}
              </a>
            )
          })
        )}
      </div>
    </div>
  )
}
