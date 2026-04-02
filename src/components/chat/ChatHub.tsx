'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChatSidebar, type SidebarRoom } from './ChatSidebar'
import { ChatWindow, type ChatMemberProfile } from './ChatWindow'
import { MessageCircle } from 'lucide-react'
import type { Message, Profile } from '@/types'

interface ChatHubProps {
  initialRooms: SidebarRoom[]
  currentUser: Profile
  initialRoomId?: string | null
}

export function ChatHub({ initialRooms, currentUser, initialRoomId }: ChatHubProps) {
  const [rooms, setRooms] = useState<SidebarRoom[]>(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId || null)
  const [roomData, setRoomData] = useState<{
    roomId: string
    roomName: string
    roomType: 'trip' | 'general' | 'direct'
    messages: Message[]
    memberProfiles: ChatMemberProfile[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const loadingRoomRef = useRef<string | null>(null)

  // Load room data client-side when a room is selected
  const loadRoom = useCallback(async (roomId: string) => {
    if (loadingRoomRef.current === roomId) return
    loadingRoomRef.current = roomId
    setLoading(true)

    const supabase = createClient()

    try {
      // Fetch room details
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('*, package:packages(title, destination:destinations(name, state))')
        .eq('id', roomId)
        .eq('is_active', true)
        .single()

      if (!room) {
        setLoading(false)
        loadingRoomRef.current = null
        return
      }

      // Check/auto-join
      const { data: membership } = await supabase
        .from('chat_room_members')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', currentUser.id)
        .single()

      if (!membership && room.type === 'general') {
        await supabase.from('chat_room_members').upsert({ room_id: roomId, user_id: currentUser.id })
      } else if (!membership && room.type !== 'general') {
        setLoading(false)
        loadingRoomRef.current = null
        return
      }

      // Fetch messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*, user:profiles(id, username, full_name, avatar_url)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100)

      // Fetch members
      const { data: members } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', roomId)

      const memberIds = (members || []).map(m => m.user_id).filter(Boolean)
      let memberProfiles: ChatMemberProfile[] = []

      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio, phone_number, phone_public')
          .in('id', memberIds)

        const { data: phoneRequests } = await supabase
          .from('phone_requests')
          .select('target_id, status')
          .eq('requester_id', currentUser.id)
          .in('target_id', memberIds)

        const requestMap = new Map((phoneRequests || []).map(r => [r.target_id, r.status]))

        memberProfiles = (profiles || []).map(p => ({
          ...p,
          phone_request_status: requestMap.get(p.id) || null,
        })) as ChatMemberProfile[]
      }

      // Resolve display name
      let displayName = room.name
      if (room.type === 'direct') {
        const otherMember = memberProfiles.find(m => m.id !== currentUser.id)
        if (otherMember) displayName = otherMember.full_name || otherMember.username
      }

      // Only update if this is still the selected room
      if (loadingRoomRef.current === roomId) {
        setRoomData({
          roomId,
          roomName: displayName,
          roomType: room.type as 'trip' | 'general' | 'direct',
          messages: (msgs || []) as Message[],
          memberProfiles,
        })
      }
    } catch (err) {
      console.error('Failed to load room:', err)
    } finally {
      setLoading(false)
      if (loadingRoomRef.current === roomId) loadingRoomRef.current = null
    }
  }, [currentUser.id])

  // Handle room selection (client-side, no page navigation)
  const handleRoomSelect = useCallback((roomId: string) => {
    setSelectedRoomId(roomId)
    // Update URL without full navigation
    window.history.replaceState(null, '', `/community?room=${roomId}`)
    loadRoom(roomId)
  }, [loadRoom])

  // Load initial room if provided
  useEffect(() => {
    if (initialRoomId) {
      loadRoom(initialRoomId)
    }
  }, [initialRoomId, loadRoom])

  // Check URL param on mount
  useEffect(() => {
    const roomParam = searchParams?.get('room')
    if (roomParam && roomParam !== selectedRoomId) {
      setSelectedRoomId(roomParam)
      loadRoom(roomParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for realtime new messages to update sidebar
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('sidebar-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as { room_id: string; content: string; created_at: string; user_id: string; message_type: string }
        if (msg.message_type === 'system') return

        setRooms(prev => {
          const idx = prev.findIndex(r => r.id === msg.room_id)
          if (idx === -1) return prev

          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            lastMessage: msg.content,
            lastMessageAt: msg.created_at,
          }

          // Re-sort: move updated room to top
          const [movedRoom] = updated.splice(idx, 1)
          return [movedRoom, ...updated]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Handle back to sidebar on mobile
  const handleBack = useCallback(() => {
    setSelectedRoomId(null)
    setRoomData(null)
    window.history.replaceState(null, '', '/community')
  }, [])

  return (
    <div className="h-[calc(100dvh-64px)] flex overflow-hidden">
      {/* Sidebar — full width on mobile when no room selected, fixed width on desktop */}
      <div className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-96 md:min-w-[384px] border-r border-border flex-col overflow-hidden`}>
        <ChatSidebar
          rooms={rooms}
          activeRoomId={selectedRoomId}
          onRoomSelect={handleRoomSelect}
          className="flex-1"
        />
      </div>

      {/* Chat area */}
      <div className={`${selectedRoomId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 overflow-hidden`}>
        {loading && !roomData ? (
          <div className="flex-1 flex items-center justify-center bg-secondary/10">
            <div className="text-center">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading chat...</p>
            </div>
          </div>
        ) : roomData && selectedRoomId ? (
          <ChatWindow
            key={roomData.roomId}
            roomId={roomData.roomId}
            roomName={roomData.roomName}
            roomType={roomData.roomType}
            initialMessages={roomData.messages}
            currentUser={currentUser}
            memberProfiles={roomData.memberProfiles}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-secondary/10">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 text-primary/20" />
              <h3 className="text-lg font-bold text-muted-foreground">Select a conversation</h3>
              <p className="text-sm text-muted-foreground/60 mt-1">Choose from your chats on the left</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
