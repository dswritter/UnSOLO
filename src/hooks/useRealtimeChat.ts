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
            // Replace optimistic message from same user with same content
            const withoutOptimistic = prev.filter(m =>
              !(m.id.startsWith('optimistic-') && m.user_id === enriched.user_id && m.content === enriched.content)
            )
            return [...withoutOptimistic, enriched]
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

  // Listen for global new-message events from sidebar's realtime (instant delivery)
  // NO DB queries here — use cached profile data from existing messages or memberProfiles
  useEffect(() => {
    function handleNewMessage(e: Event) {
      const msg = (e as CustomEvent).detail as { id: string; room_id: string; content: string; created_at: string; user_id: string }
      if (msg.room_id !== roomId) return

      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev

        // Try to find profile from existing messages (no DB query)
        const existingUserMsg = prev.find(m => m.user_id === msg.user_id && m.user)
        const userProfile = existingUserMsg?.user || (currentUser?.id === msg.user_id ? currentUser : undefined)

        const enriched: Message = {
          id: msg.id,
          room_id: msg.room_id,
          user_id: msg.user_id,
          content: msg.content,
          message_type: 'text',
          is_edited: false,
          created_at: msg.created_at,
          user: userProfile,
        }

        // Remove matching optimistic message
        const cleaned = prev.filter(m =>
          !(m.id.startsWith('optimistic-') && m.user_id === enriched.user_id && m.content === enriched.content)
        )
        return [...cleaned, enriched]
      })
    }

    window.addEventListener('unsolo:new-message', handleNewMessage)
    return () => window.removeEventListener('unsolo:new-message', handleNewMessage)
  }, [roomId, currentUser])

  // One-time catch-up poll 15s after mount (safety net, not recurring)
  useEffect(() => {
    const timer = setTimeout(async () => {
      const lastMsg = messages.filter(m => !m.id.startsWith('optimistic-')).slice(-1)[0]
      if (!lastMsg) return
      const { data } = await supabase
        .from('messages')
        .select('*, user:profiles(id, username, full_name, avatar_url)')
        .eq('room_id', roomId)
        .gt('created_at', lastMsg.created_at)
        .order('created_at', { ascending: true })
        .limit(50)
      if (data && data.length > 0) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const newMsgs = (data as Message[]).filter(m => !ids.has(m.id))
          return newMsgs.length > 0 ? [...prev.filter(m => !m.id.startsWith('optimistic-') || !newMsgs.some(n => n.user_id === m.user_id && n.content === m.content)), ...newMsgs] : prev
        })
      }
    }, 15000)
    return () => clearTimeout(timer)
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

  // Add optimistic message (shows instantly before server confirms)
  const addOptimisticMessage = useCallback((content: string) => {
    if (!currentUser) return
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      room_id: roomId,
      user_id: currentUser.id,
      content,
      message_type: 'text',
      created_at: new Date().toISOString(),
      is_edited: false,
      user: currentUser,
    }
    setMessages(prev => [...prev, optimisticMsg])
  }, [currentUser, roomId])

  return { messages, typingUsers, isConnected, broadcastTyping, onlineUsers, addOptimisticMessage }
}
