'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message, Profile } from '@/types'

export function useRealtimeChat(
  roomId: string,
  initialMessages: Message[] = [],
  currentUser?: Profile,
) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; username: string }[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const supabase = createClient()

  useEffect(() => {
    if (!roomId) return

    // Separate channel for typing indicator using broadcast
    const typingChannel = supabase.channel(`typing:${roomId}`)
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, username } = payload.payload as { user_id: string; username: string }
        if (user_id === currentUser?.id) return

        setTypingUsers(prev => {
          if (prev.find(u => u.user_id === user_id)) return prev
          return [...prev, { user_id, username }]
        })

        // Clear after 3s
        const existing = typingTimeoutRef.current.get(user_id)
        if (existing) clearTimeout(existing)
        typingTimeoutRef.current.set(user_id, setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.user_id !== user_id))
          typingTimeoutRef.current.delete(user_id)
        }, 3000))
      })
      .subscribe()

    const channel = supabase
      .channel(`room:${roomId}`, {
        config: { presence: { key: roomId } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newMsg.user_id)
            .single()
          const enriched: Message = { ...newMsg, user: (profileData as Profile) || undefined }
          setMessages((prev) => {
            if (prev.find((m) => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
          // Clear typing for this user when they send a message
          setTypingUsers(prev => prev.filter(u => u.user_id !== newMsg.user_id))
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string; username: string }>()
        const allPresence = Object.values(state).flat()
        const userIds = allPresence.map((p) => p.user_id).filter(Boolean)
        setOnlineUsers([...new Set(userIds)])
      })
      .subscribe(async (status) => {
        setIsConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED' && currentUser) {
          await channel.track({
            user_id: currentUser.id,
            username: currentUser.username,
            online_at: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(typingChannel)
      typingTimeoutRef.current.forEach(t => clearTimeout(t))
      typingTimeoutRef.current.clear()
    }
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const broadcastTyping = useCallback(() => {
    if (!currentUser) return
    const typingChannel = supabase.channel(`typing:${roomId}`)
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUser.id, username: currentUser.username },
    })
  }, [currentUser, roomId, supabase])

  return { messages, typingUsers, isConnected, broadcastTyping, onlineUsers }
}
