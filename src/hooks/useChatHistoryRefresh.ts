'use client'

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { fetchRoomMessagesClient } from '@/lib/chat/fetchRoomMessages'
import type { Message } from '@/types'
import { toast } from 'sonner'

export function useChatHistoryRefresh(
  roomId: string,
  messages: Message[],
  scrollRef: RefObject<HTMLDivElement | null>,
  setMessages: (updater: (previous: Message[]) => Message[]) => void,
) {
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)
  const currentRoom = useRef(roomId)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const skipAutoScroll = useRef(false)
  const pullStart = useRef<{ x: number; y: number } | null>(null)
  const wheelPull = useRef({ distance: 0, at: 0 })
  const lastWheelRefresh = useRef(0)
  useLayoutEffect(() => {
    currentRoom.current = roomId
    anchor.current = null
    skipAutoScroll.current = false
  }, [roomId])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !anchor.current) return
    el.scrollTop = anchor.current.top + el.scrollHeight - anchor.current.height
    anchor.current = null
  }, [messages, scrollRef])

  const consumeHistoryChange = useCallback(() => {
    const skip = skipAutoScroll.current
    skipAutoScroll.current = false
    return skip
  }, [])

  const refreshHistory = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const oldest = messages.find(message => !message.id.startsWith('optimistic-'))
      const [older, latest] = await Promise.all([
        oldest ? fetchRoomMessagesClient(roomId, oldest.created_at) : Promise.resolve([]),
        fetchRoomMessagesClient(roomId),
      ])
      if (currentRoom.current !== roomId) return
      const el = scrollRef.current
      if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop }
      skipAutoScroll.current = true
      setMessages(previous => [...new Map([...older, ...previous, ...latest].map(message => [message.id, message])).values()]
        .sort((a, b) => a.created_at.localeCompare(b.created_at)))
    } catch (error) {
      console.error('Unable to refresh chat history', error)
      toast.error('Unable to refresh messages. Please try again.')
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [messages, roomId, scrollRef, setMessages])

  return {
    refreshing,
    refreshHistory,
    consumeHistoryChange,
    pullHandlers: {
      onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0]
        pullStart.current = event.touches.length === 1 && scrollRef.current && scrollRef.current.scrollTop <= 0
          ? { x: touch.clientX, y: touch.clientY } : null
      },
      onTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => {
        const start = pullStart.current
        pullStart.current = null
        const touch = event.changedTouches[0]
        if (!start || !touch || !scrollRef.current || scrollRef.current.scrollTop > 0) return
        const dy = touch.clientY - start.y
        if (dy >= 64 && dy > Math.abs(touch.clientX - start.x)) void refreshHistory()
      },
      onTouchCancel: () => { pullStart.current = null },
      onWheel: (event: React.WheelEvent<HTMLDivElement>) => {
        if (!scrollRef.current || scrollRef.current.scrollTop > 0 || event.deltaY >= 0) {
          wheelPull.current.distance = 0
          return
        }
        const now = Date.now()
        if (now - lastWheelRefresh.current < 1500) return
        const pixels = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollRef.current.clientHeight : 1)
        wheelPull.current = { distance: (now - wheelPull.current.at < 250 ? wheelPull.current.distance : 0) + pixels, at: now }
        if (wheelPull.current.distance >= 80) {
          wheelPull.current.distance = 0
          lastWheelRefresh.current = now
          void refreshHistory()
        }
      },
    },
  }
}
