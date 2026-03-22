'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message, Profile } from '@/types'

export function useRealtimeChat(roomId: string, initialMessages: Message[] = []) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!roomId) return

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
          // Fetch full profile for the message
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
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ username: string }>()
        const users = Object.values(state).flat().map((p) => p.username)
        setTypingUsers(users)
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const trackTyping = useCallback(
    (username: string) => {
      channelRef.current?.track({ username })
    },
    []
  )

  return { messages, typingUsers, isConnected, trackTyping }
}
