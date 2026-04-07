'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWindow, type ChatMemberProfile } from './ChatWindow'
import type { Message, Profile } from '@/types'

interface ChatRoomLoaderProps {
  roomId: string
  currentUser: Profile
  onBack?: () => void
}

interface CachedRoom {
  roomId: string
  roomName: string
  roomType: 'trip' | 'general' | 'direct'
  messages: Message[]
  memberProfiles: ChatMemberProfile[]
  loadedAt: number
}

// Global cache — persists across component remounts
const roomCache = new Map<string, CachedRoom>()

export function ChatRoomLoader({ roomId, currentUser, onBack }: ChatRoomLoaderProps) {
  const [roomData, setRoomData] = useState<CachedRoom | null>(roomCache.get(roomId) || null)
  const [loading, setLoading] = useState(!roomCache.has(roomId))
  const loadingRef = useRef<string | null>(null)

  const loadRoom = useCallback(async (id: string) => {
    // Show cached data instantly while refetching (stale-while-revalidate)
    const cached = roomCache.get(id)
    if (cached) {
      setRoomData(cached)
      setLoading(false)
    }

    // Always fetch fresh data (in background if cached data shown)
    loadingRef.current = id
    if (!cached) setLoading(true)

    const supabase = createClient()

    try {
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('id, name, type')
        .eq('id', id)
        .single()

      if (!room || loadingRef.current !== id) return

      // Fetch messages + members in parallel
      const [{ data: msgs }, { data: members }] = await Promise.all([
        supabase.from('messages').select('*, user:profiles(id, username, full_name, avatar_url)').eq('room_id', id).order('created_at', { ascending: true }).limit(100),
        supabase.from('chat_room_members').select('user_id').eq('room_id', id),
      ])

      const memberIds = (members || []).map(m => m.user_id).filter(Boolean)
      let memberProfiles: ChatMemberProfile[] = []

      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, phone_number, phone_public')
          .in('id', memberIds)
        memberProfiles = (profiles || []).map(p => ({ ...p, phone_request_status: null })) as ChatMemberProfile[]
      }

      // Resolve display name
      let displayName = room.name
      if (room.type === 'direct') {
        const other = memberProfiles.find(m => m.id !== currentUser.id)
        if (other) displayName = other.full_name || other.username
      }

      if (loadingRef.current !== id) return

      const data: CachedRoom = {
        roomId: id,
        roomName: displayName,
        roomType: room.type as 'trip' | 'general' | 'direct',
        messages: (msgs || []) as Message[],
        memberProfiles,
        loadedAt: Date.now(),
      }

      roomCache.set(id, data)
      setRoomData(data)
    } finally {
      if (loadingRef.current === id) {
        setLoading(false)
        loadingRef.current = null
      }
    }
  }, [currentUser.id])

  useEffect(() => {
    loadRoom(roomId)
  }, [roomId, loadRoom])

  // Mark messages as read
  useEffect(() => {
    if (!roomData) return
    const supabase = createClient()
    const timer = setTimeout(() => {
      void supabase.rpc('mark_room_messages_read', { p_room_id: roomId, p_user_id: currentUser.id })
    }, 500)
    return () => clearTimeout(timer)
  }, [roomId, currentUser.id, roomData])

  if (loading && !roomData) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <div className="space-y-1.5">
            <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
            <div className="h-3 w-20 bg-secondary/60 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 px-4 py-4 space-y-4">
          <div className="flex gap-3"><div className="h-7 w-7 rounded-full bg-secondary animate-pulse shrink-0" /><div className="h-8 w-48 bg-secondary rounded-2xl animate-pulse" /></div>
          <div className="flex gap-3 flex-row-reverse"><div className="h-7 w-7 rounded-full bg-secondary animate-pulse shrink-0" /><div className="h-8 w-36 bg-primary/20 rounded-2xl animate-pulse" /></div>
        </div>
        <div className="px-4 py-3 border-t border-border"><div className="h-10 bg-secondary rounded-lg animate-pulse" /></div>
      </div>
    )
  }

  if (!roomData) return null

  return (
    <ChatWindow
      key={roomData.roomId}
      roomId={roomData.roomId}
      roomName={roomData.roomName}
      roomType={roomData.roomType}
      initialMessages={roomData.messages}
      currentUser={currentUser}
      memberProfiles={roomData.memberProfiles}
      onBack={onBack}
    />
  )
}
