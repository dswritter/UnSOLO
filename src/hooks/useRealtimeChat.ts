'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'
import type { Message, Profile } from '@/types'

export function useRealtimeChat(
  roomId: string,
  messages: Message[],
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  currentUser?: Profile,
) {
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; username: string }[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const messagesRef = useRef<Message[]>(messages)
  const currentUserRef = useRef(currentUser)
  messagesRef.current = messages
  currentUserRef.current = currentUser
  const supabase = createClient()

  const roomKey = normalizeRoomId(roomId)

  useEffect(() => {
    if (!roomKey) return

    // Separate channel for typing indicator using broadcast
    const typingChannel = supabase.channel(`typing:${roomKey}`)
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload: { payload: { user_id: string; username: string } }) => {
        const { user_id, username } = payload.payload as { user_id: string; username: string }
        if (user_id === currentUserRef.current?.id) return

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
      .channel(`room:${roomKey}`, {
        config: { presence: { key: roomKey } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomKey}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new as Message
          if (normalizeRoomId(newMsg.room_id) !== roomKey) return

          let userProfile: Profile | undefined
          try {
            const { data: profileData, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newMsg.user_id)
              .single()
            if (!error && profileData) userProfile = profileData as Profile
          } catch {
            /* still append message below */
          }

          const enriched: Message = { ...newMsg, user: userProfile }
          setMessages((prev) => {
            if (prev.find((m) => m.id === enriched.id)) return prev
            const withoutOptimistic = prev.filter(m =>
              !(m.id.startsWith('optimistic-') && m.user_id === enriched.user_id && m.content === enriched.content)
            )
            return [...withoutOptimistic, enriched]
          })
          setTypingUsers(prev => prev.filter(u => u.user_id !== newMsg.user_id))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomKey}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as Message
          if (normalizeRoomId(updated.room_id) !== roomKey) return
          setMessages(prev =>
            prev.map(m =>
              m.id === updated.id
                ? { ...m, ...updated, user: m.user }
                : m,
            ),
          )
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string; username: string }>()
        const allPresence = Object.values(state).flat() as { user_id: string; username: string }[]
        const userIds = allPresence.map(p => p.user_id).filter(Boolean)
        setOnlineUsers([...new Set(userIds)])
      })
      .subscribe(async (status: string) => {
        setIsConnected(status === 'SUBSCRIBED')
        const u = currentUserRef.current
        if (status === 'SUBSCRIBED' && u) {
          await channel.track({
            user_id: u.id,
            username: u.username,
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
  }, [roomKey, setMessages])

  // Listen for global new-message events from sidebar's realtime (instant delivery)
  // NO DB queries here — use cached profile data from existing messages or memberProfiles
  useEffect(() => {
    function handleNewMessage(e: Event) {
      const msg = (e as CustomEvent).detail as { id: string; room_id: string; content: string; created_at: string; user_id: string }
      if (normalizeRoomId(msg.room_id) !== roomKey) return

      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev

        const cu = currentUserRef.current
        const existingUserMsg = prev.find(m => m.user_id === msg.user_id && m.user)
        const userProfile = existingUserMsg?.user || (cu?.id === msg.user_id ? cu : undefined)

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
  }, [roomKey, setMessages])

  // Catch-up poll while tab is visible (Realtime can miss events with multiple tabs/channels)
  useEffect(() => {
    if (!roomKey) return

    async function pollNewer() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      const prev = messagesRef.current
      const lastMsg = prev.filter(m => !m.id.startsWith('optimistic-')).slice(-1)[0]
      if (!lastMsg) return

      const { data, error } = await supabase
        .from('messages')
        .select('*, user:profiles(id, username, full_name, avatar_url)')
        .eq('room_id', roomKey)
        .gt('created_at', lastMsg.created_at)
        .order('created_at', { ascending: true })
        .limit(50)

      if (error || !data?.length) return

      setMessages(prevMsgs => {
        const ids = new Set(prevMsgs.map(m => m.id))
        const newMsgs = (data as Message[]).filter(m => !ids.has(m.id))
        if (newMsgs.length === 0) return prevMsgs
        const withoutDupOptimistic = prevMsgs.filter(
          m => !(
            m.id.startsWith('optimistic-')
            && newMsgs.some(n => n.user_id === m.user_id && n.content === m.content)
          ),
        )
        return [...withoutDupOptimistic, ...newMsgs]
      })
    }

    const interval = setInterval(() => { void pollNewer() }, 4000)
    const onVisible = () => { if (document.visibilityState === 'visible') void pollNewer() }
    document.addEventListener('visibilitychange', onVisible)
    void pollNewer()

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [roomKey, setMessages])

  const broadcastTyping = useCallback(() => {
    if (!currentUser) return
    const typingChannel = supabase.channel(`typing:${roomKey}`)
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUser.id, username: currentUser.username },
    })
  }, [currentUser, roomKey, supabase])

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
  }, [currentUser, roomId, setMessages])

  return { messages, typingUsers, isConnected, broadcastTyping, onlineUsers, addOptimisticMessage }
}
