'use client'

import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/actions/chat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageCircle, X, Maximize2, Minus, Send, ArrowLeft, Loader2, Check, CheckCheck } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { playNotificationSound, sendSystemNotification, preloadSound } from '@/lib/notifications/soundController'
import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'

/** Supabase broadcast payloads may be `{ payload: { user_id, username } }` or doubly nested. */
function parseTypingBroadcast(raw: unknown): { user_id: string; username: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const top = raw as Record<string, unknown>
  const p = top.payload
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>
    if (typeof o.user_id === 'string' && typeof o.username === 'string') {
      return { user_id: o.user_id, username: o.username }
    }
    const inner = o.payload
    if (inner && typeof inner === 'object') {
      const i = inner as Record<string, unknown>
      if (typeof i.user_id === 'string' && typeof i.username === 'string') {
        return { user_id: i.user_id, username: i.username }
      }
    }
  }
  return null
}

type ChatRoomType = 'direct' | 'trip' | 'general'

interface ChatNotification {
  id: string
  room_id: string
  room_name: string
  room_type?: string | null
  content: string
  created_at: string
  /** Outbound rows from this device (for read-receipt + layout). */
  isOutbound?: boolean
  user?: {
    username: string
    full_name: string | null
    avatar_url: string | null
  }
}

type ReadReceiptRow = { message_id: string; user_id: string; read_at?: string }

export function ChatNotificationWidget({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<ChatNotification[]>([])
  const [minimized, setMinimized] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [activeRoom, setActiveRoom] = useState<{ id: string; name: string; roomType?: ChatRoomType } | null>(null)
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([])
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceiptRow[]>>(new Map())
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMessages, setSentMessages] = useState<ChatNotification[]>([])
  const [userInteracting, setUserInteracting] = useState(false)
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; username: string }[]>([])
  const [viewerUsername, setViewerUsername] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  /** Panel was collapsed to FAB — next expand should jump to latest message. */
  const miniPanelWasMinimizedRef = useRef(true)
  const miniThreadPrevTailRef = useRef<string | null>(null)
  const autoMinimizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const typingThrottleRef = useRef<NodeJS.Timeout | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const typingChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const activeRoomRef = useRef<typeof activeRoom>(null)
  activeRoomRef.current = activeRoom
  const pathname = usePathname()
  const chatListBase = pathname?.startsWith('/tribe') ? '/tribe' : '/community'

  const isOnChatPage =
    pathname?.startsWith('/chat') || pathname?.startsWith('/community') || pathname?.startsWith('/tribe')

  // Preload notification sound
  useEffect(() => { preloadSound() }, [])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    void supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.username) setViewerUsername(data.username)
      })
  }, [userId])

  /** Listen for typing in the open thread, or in the only room in the inbox list. */
  const typingRoomId = useMemo(() => {
    if (activeRoom?.id) return activeRoom.id
    const ids = [...new Set(notifications.map(n => n.room_id))]
    return ids.length === 1 ? ids[0] : null
  }, [activeRoom?.id, notifications])

  /** Same channel name / event as useRealtimeChat so full chat and mini widget see each other. */
  useEffect(() => {
    if (!typingRoomId || !userId) {
      typingChannelRef.current = null
      setTypingUsers([])
      return
    }

    const supabase = createClient()
    const roomKey = normalizeRoomId(typingRoomId)
    const typingChannel = supabase.channel(`typing:${roomKey}`)
    typingChannelRef.current = typingChannel

    typingChannel
      .on('broadcast', { event: 'typing' }, (evt: unknown) => {
        const parsed = parseTypingBroadcast(evt)
        if (!parsed || parsed.user_id === userId) return
        const { user_id, username } = parsed

        setTypingUsers(prev => (prev.some(u => u.user_id === user_id) ? prev : [...prev, { user_id, username }]))

        const existing = typingTimeoutsRef.current.get(user_id)
        if (existing) clearTimeout(existing)
        typingTimeoutsRef.current.set(
          user_id,
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.user_id !== user_id))
            typingTimeoutsRef.current.delete(user_id)
          }, 3000),
        )
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') typingChannelRef.current = typingChannel
      })

    return () => {
      supabase.removeChannel(typingChannel)
      typingChannelRef.current = null
      typingTimeoutsRef.current.forEach(t => clearTimeout(t))
      typingTimeoutsRef.current.clear()
      setTypingUsers([])
    }
  }, [typingRoomId, userId])

  const broadcastTyping = useCallback(() => {
    if (!viewerUsername || !activeRoom?.id) return
    const ch = typingChannelRef.current
    if (!ch) return
    void ch.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, username: viewerUsername },
    })
  }, [viewerUsername, activeRoom?.id, userId])

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    const channel = supabase
      .channel('global-chat-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as { id: string; room_id: string; content: string; created_at: string; user_id: string; message_type: string }

          if (msg.user_id === userId || msg.message_type === 'system') return

          const [{ data: membership }, { data: senderProfile }, { data: room }] = await Promise.all([
            supabase
              .from('chat_room_members')
              .select('id')
              .eq('room_id', msg.room_id)
              .eq('user_id', userId)
              .single(),
            supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', msg.user_id)
              .single(),
            supabase
              .from('chat_rooms')
              .select('name, type')
              .eq('id', msg.room_id)
              .single(),
          ])

          if (!membership) return

          setTypingUsers(prev => prev.filter(u => u.user_id !== msg.user_id))

          const notification: ChatNotification = {
            id: msg.id,
            room_id: msg.room_id,
            room_name: room?.name || 'Chat',
            room_type: room?.type ?? null,
            content: msg.content,
            created_at: msg.created_at,
            user: senderProfile || undefined,
          }

          setNotifications(prev => [notification, ...prev].slice(0, 8))
          setDismissed(false)
          setMinimized(false)

          playNotificationSound({
            messageRoomId: msg.room_id,
            activeRoomId: activeRoomRef.current?.id ?? null,
            roomType: (room?.type as 'direct' | 'trip' | 'general') || 'general',
            unreadCount: 0,
            isTyping: false,
          })

          sendSystemNotification(
            senderProfile?.full_name || senderProfile?.username || 'New message',
            msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content,
          )

          setActiveRoom(prev => prev ?? {
            id: msg.room_id,
            name: room?.name || 'Chat',
            roomType: (room?.type as ChatRoomType) || 'general',
          })

          if (autoMinimizeTimerRef.current) clearTimeout(autoMinimizeTimerRef.current)
          autoMinimizeTimerRef.current = setTimeout(() => {
            setMinimized(prev => {
              if (!userInteracting) return true
              return prev
            })
          }, 8000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const unreadBadgeCount = useMemo(
    () => notifications.filter(n => !seenNotificationIds.includes(n.id)).length,
    [notifications, seenNotificationIds],
  )

  /** One mark-read + "seen" pass per latest inbound notification in the active room (new messages need a new engagement). */
  const miniReadEngagementKeyRef = useRef<string | null>(null)
  useEffect(() => {
    miniReadEngagementKeyRef.current = null
  }, [activeRoom?.id])

  const engageMiniMarkReadAndSeen = useCallback(async () => {
    if (!activeRoom?.id || !userId) return
    let latestInboundId: string | null = null
    for (const n of notifications) {
      if (n.room_id === activeRoom.id && !n.isOutbound) {
        latestInboundId = n.id
        break
      }
    }
    const key = `${activeRoom.id}:${latestInboundId ?? '__none__'}`
    if (miniReadEngagementKeyRef.current === key) return
    miniReadEngagementKeyRef.current = key

    const roomId = activeRoom.id
    setSeenNotificationIds(prev => {
      const next = new Set(prev)
      for (const n of notifications) {
        if (n.room_id === roomId) next.add(n.id)
      }
      const arr = Array.from(next)
      if (arr.length === prev.length && prev.every(id => next.has(id))) return prev
      return arr
    })

    const sb = createClient()
    const { error: rpcError } = await sb.rpc('mark_room_messages_read', {
      p_room_id: roomId,
      p_user_id: userId,
    })
    if (rpcError) {
      const inRoom = notifications.filter(n => n.room_id === roomId && !n.isOutbound)
      for (const n of inRoom.slice(-30)) {
        await sb.from('message_read_receipts').upsert(
          { message_id: n.id, user_id: userId },
          { onConflict: 'message_id,user_id' },
        )
      }
    }
  }, [activeRoom?.id, userId, notifications])

  /** Load + subscribe to read receipts for our outbound messages (real UUID ids only). */
  useEffect(() => {
    if (!userId || !activeRoom?.id) {
      setReadReceipts(new Map())
      return
    }
    const ids = sentMessages.filter(
      m => m.room_id === activeRoom.id && m.isOutbound && !m.id.startsWith('optimistic-'),
    ).map(m => m.id)
    if (ids.length === 0) {
      setReadReceipts(new Map())
      return
    }

    const sb = createClient()

    async function loadReceipts() {
      const { data } = await sb
        .from('message_read_receipts')
        .select('message_id, user_id, read_at')
        .in('message_id', ids)
      const map = new Map<string, ReadReceiptRow[]>()
      for (const r of data || []) {
        const row = r as ReadReceiptRow
        const arr = map.get(row.message_id) || []
        arr.push(row)
        map.set(row.message_id, arr)
      }
      setReadReceipts(map)
    }

    void loadReceipts()
    const poll = setInterval(() => void loadReceipts(), 60000)

    const ch = sb
      .channel(`mini-read-receipts-${activeRoom.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_read_receipts' },
        (payload: { new: Record<string, unknown> }) => {
          const r = payload.new as ReadReceiptRow
          if (!ids.includes(r.message_id)) return
          setReadReceipts(prev => {
            const next = new Map(prev)
            const arr = [...(next.get(r.message_id) || [])]
            if (!arr.find(x => x.user_id === r.user_id)) arr.push(r)
            next.set(r.message_id, arr)
            return next
          })
        },
      )
      .subscribe()

    return () => {
      clearInterval(poll)
      void sb.removeChannel(ch)
    }
  }, [activeRoom?.id, userId, sentMessages])

  function onReplyInputChange(value: string) {
    setReplyText(value)
    setUserInteracting(true)
    if (value.length > 0) void engageMiniMarkReadAndSeen()
    if (!value.trim() || !viewerUsername) return
    if (!typingThrottleRef.current) {
      broadcastTyping()
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null
      }, 1000)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !activeRoom || sending) return
    void engageMiniMarkReadAndSeen()
    const msgText = replyText.trim()
    const optimisticId = `optimistic-${Date.now()}`
    setSentMessages(prev => [...prev, {
      id: optimisticId,
      room_id: activeRoom.id,
      room_name: activeRoom.name,
      content: msgText,
      created_at: new Date().toISOString(),
      isOutbound: true,
      user: { username: 'You', full_name: 'You', avatar_url: null },
    }])
    setReplyText('')
    setSending(true)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const result = await sendMessage(activeRoom.id, msgText)
    setSending(false)

    if (result.error) {
      toast.error(result.error)
      setSentMessages(prev => prev.filter(m => m.id !== optimisticId))
      setReplyText(msgText)
    } else if ('success' in result && result.success && result.messageId) {
      setSentMessages(prev => prev.map(m =>
        m.id === optimisticId
          ? { ...m, id: result.messageId }
          : m,
      ))
    }
    inputRef.current?.focus()
  }

  function miniReadStatus(messageId: string): 'sending' | 'sent' | 'read' {
    if (messageId.startsWith('optimistic-')) return 'sending'
    const receipts = readReceipts.get(messageId) || []
    const isDM = activeRoom?.roomType === 'direct'
    if (isDM) {
      const otherRead = receipts.find(r => r.user_id !== userId)
      return otherRead ? 'read' : 'sent'
    }
    return receipts.length > 0 ? 'read' : 'sent'
  }

  function openRoomChat(roomId: string, roomName: string) {
    const hit = notifications.find(n => n.room_id === roomId)
    const rt = (hit?.room_type as ChatRoomType) || 'general'
    setActiveRoom({ id: roomId, name: roomName, roomType: rt })
    setUserInteracting(true)
    // Cancel auto-minimize when user explicitly opens a room
    if (autoMinimizeTimerRef.current) {
      clearTimeout(autoMinimizeTimerRef.current)
      autoMinimizeTimerRef.current = null
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const activeRoomNotifications = useMemo(() => {
    if (!activeRoom) return []
    const inRoom = notifications.filter(n => n.room_id === activeRoom.id)
    const outbound = sentMessages.filter(m => m.room_id === activeRoom.id)
    return [...inRoom, ...outbound].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
  }, [activeRoom?.id, notifications, sentMessages])

  const miniThreadTailId =
    activeRoomNotifications.length > 0
      ? activeRoomNotifications[activeRoomNotifications.length - 1]!.id
      : null

  const scrollMiniThreadToBottom = useCallback(() => {
    const wrap = messagesScrollRef.current
    if (!wrap) return
    wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'auto' })
  }, [])

  useLayoutEffect(() => {
    if (isOnChatPage) return

    if (minimized) {
      miniPanelWasMinimizedRef.current = true
      return
    }

    if (!activeRoom) {
      miniThreadPrevTailRef.current = null
      return
    }

    if (!miniThreadTailId) return

    const openedFromIcon = miniPanelWasMinimizedRef.current
    miniPanelWasMinimizedRef.current = false

    const tailGrew = miniThreadPrevTailRef.current !== miniThreadTailId
    miniThreadPrevTailRef.current = miniThreadTailId

    if (openedFromIcon || tailGrew) {
      scrollMiniThreadToBottom()
      requestAnimationFrame(() => {
        const w = messagesScrollRef.current
        if (w) w.scrollTo({ top: w.scrollHeight, behavior: 'auto' })
      })
    }
  }, [isOnChatPage, minimized, activeRoom?.id, miniThreadTailId, scrollMiniThreadToBottom])

  if (isOnChatPage) return null
  // Dismissed = hide button until next new message arrives
  if (dismissed && notifications.length === 0) return null

  const iconBtn =
    'rounded-lg p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fcba03]/60'

  return (
    <div className="fixed bottom-20 right-6 z-50 flex flex-col items-end gap-1.5 pointer-events-none md:bottom-6">
      {minimized && typingRoomId && typingUsers.length > 0 && (
        <div
          className="pointer-events-none max-w-[min(16rem,calc(100vw-5rem))] rounded-xl border border-white/15 bg-[oklch(0.12_0.045_152/0.95)] px-3 py-1.5 text-right text-[10px] text-white/80 shadow-lg backdrop-blur-sm"
          aria-live="polite"
        >
          <span className="italic">
            {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </span>
        </div>
      )}
      {minimized || notifications.length === 0 ? (
        <button
          type="button"
          onClick={() => notifications.length > 0 ? setMinimized(false) : (window.location.href = chatListBase)}
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-[#fcba03] text-[oklch(0.18_0.04_155)] shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-2 ring-white/15 transition-all hover:scale-105 hover:bg-[#e5ab03]"
          aria-label={notifications.length > 0 ? 'Open chat notifications' : 'Open chats'}
        >
          <MessageCircle className="h-6 w-6" />
          {unreadBadgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadBadgeCount}
            </span>
          )}
        </button>
      ) : (
        <div
          className="pointer-events-auto relative isolate mb-2 flex w-[400px] max-w-[calc(100vw-4rem)] flex-col overflow-hidden rounded-2xl border border-white/15 shadow-[0_12px_48px_rgba(0,0,0,0.45)] wander-theme text-white [color-scheme:dark]"
          style={{ height: '380px', maxHeight: 'calc(100vh - 8rem)' }}
        >
          {/* Solid forest base + northern-lights glow (opaque enough to read messages; no blend with page behind) */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl" aria-hidden>
            <div
              className="absolute inset-0 rounded-2xl"
              style={{ background: 'oklch(0.11 0.046 152)' }}
            />
            <div
              className="absolute inset-0 rounded-2xl opacity-[0.92]"
              style={{
                background:
                  'radial-gradient(ellipse 88% 58% at 18% 6%, oklch(0.38 0.11 195 / 0.72) 0%, transparent 52%), radial-gradient(ellipse 72% 52% at 88% 10%, oklch(0.42 0.14 305 / 0.55) 0%, transparent 50%), radial-gradient(ellipse 110% 48% at 48% 96%, oklch(0.34 0.1 165 / 0.65) 0%, transparent 58%), radial-gradient(ellipse 55% 40% at 52% 38%, oklch(0.28 0.08 175 / 0.35) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  'linear-gradient(180deg, oklch(0.22 0.06 155 / 0.22) 0%, transparent 42%, oklch(0.06 0.03 152 / 0.55) 100%)',
              }}
            />
          </div>

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[oklch(0.1_0.044_152/0.97)] px-4 py-3 backdrop-blur-sm">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <MessageCircle className="h-4 w-4 text-[#fcba03]" aria-hidden />
                {activeRoom ? activeRoom.name : 'New Messages'}
              </span>
              <div className="flex items-center gap-0.5">
                {activeRoom && (
                  <button type="button" onClick={() => setActiveRoom(null)} className={iconBtn} title="Back to all messages">
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <Link href={activeRoom ? `${chatListBase}/${activeRoom.id}` : chatListBase} className={iconBtn} title="Open full chat">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Link>
                <button type="button" onClick={() => { setMinimized(true); setUserInteracting(false) }} className={iconBtn} title="Minimize to icon">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => { setDismissed(true); setNotifications([]); setSeenNotificationIds([]); setMinimized(true) }} className={iconBtn} title="Dismiss until next message">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesScrollRef}
              className="min-h-0 flex-1 overflow-y-auto bg-[oklch(0.105_0.045_152/0.88)]"
            >
              {activeRoom ? (
                <>
                  {activeRoomNotifications.length > 0 ? (
                    activeRoomNotifications.map((n) => {
                      const isOwn = Boolean(n.isOutbound) || n.id.startsWith('optimistic-')
                      const isPending = n.id.startsWith('optimistic-')
                      return (
                        <div key={n.id} className={`flex items-start gap-3 px-4 py-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <Avatar className="mt-0.5 h-7 w-7 shrink-0 border border-white/10">
                            <AvatarImage src={n.user?.avatar_url || ''} />
                            <AvatarFallback className="bg-white/15 text-[10px] font-bold text-[#fcba03]">
                              {getInitials(n.user?.full_name || n.user?.username || '?')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`flex max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                            {!isOwn && (
                              <span className="mb-0.5 text-[10px] font-medium text-white/60">{n.user?.full_name || n.user?.username}</span>
                            )}
                            <div
                              className={`break-words rounded-2xl px-3 py-1.5 text-sm text-white shadow-inner backdrop-blur-md ${
                                isOwn
                                  ? `rounded-tr-sm border border-[#fcba03]/45 bg-[#fcba03]/18 ${isPending ? 'opacity-90' : ''}`
                                  : 'rounded-tl-sm border border-white/15 bg-white/10'
                              }`}
                            >
                              {n.content}
                            </div>
                            <span className="mt-0.5 flex items-center gap-1 text-[9px] text-white/45">
                              {isPending ? (
                                <>
                                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#fcba03]" aria-hidden />
                                  <span>Sending…</span>
                                </>
                              ) : (
                                <>
                                  <span>{timeAgo(n.created_at)}</span>
                                  {isOwn && (miniReadStatus(n.id) === 'read' ? (
                                    <CheckCheck className="h-3.5 w-3.5 shrink-0 text-[#fcba03]" aria-label="Read" />
                                  ) : miniReadStatus(n.id) === 'sent' ? (
                                    <Check className="h-3 w-3 shrink-0 text-white/40" aria-label="Sent" />
                                  ) : null)}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-white/55">No recent messages in this room</div>
                  )}
                  {typingUsers.length > 0 ? (
                    <div className="flex items-center gap-2 px-4 pb-2 pt-1">
                      <span className="flex gap-0.5" aria-hidden>
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:0ms]" />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:150ms]" />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:300ms]" />
                      </span>
                      <span className="text-[10px] italic text-white/55">
                        {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
                      </span>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
                </>
              ) : (
                <>
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openRoomChat(n.room_id, n.room_name)}
                      className="flex w-full items-start gap-3 border-b border-white/10 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/10"
                    >
                      <Avatar className="mt-0.5 h-8 w-8 shrink-0 border border-white/10">
                        <AvatarImage src={n.user?.avatar_url || ''} />
                        <AvatarFallback className="bg-white/15 text-xs font-bold text-[#fcba03]">
                          {getInitials(n.user?.full_name || n.user?.username || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-medium text-white">{n.user?.full_name || n.user?.username || 'Someone'}</span>
                          <span className="shrink-0 text-[10px] text-white/45">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="truncate text-[10px] text-[#fcba03]/90">{n.room_name}</p>
                        <p className="mt-0.5 truncate text-xs text-white/65">{n.content}</p>
                      </div>
                    </button>
                  ))}
                  {typingUsers.length > 0 ? (
                    <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
                      <span className="flex gap-0.5" aria-hidden>
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:0ms]" />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:150ms]" />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/50 [animation-delay:300ms]" />
                      </span>
                      <span className="text-[10px] italic text-white/55">
                        {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* Reply bar */}
            {activeRoom ? (
              <form onSubmit={handleReply} className="flex gap-2 border-t border-white/10 bg-[oklch(0.095_0.042_152/0.97)] px-3 py-2 backdrop-blur-sm">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={e => onReplyInputChange(e.target.value)}
                  onFocus={() => { setUserInteracting(true); if (autoMinimizeTimerRef.current) { clearTimeout(autoMinimizeTimerRef.current); autoMinimizeTimerRef.current = null } }}
                  placeholder={`Reply in ${activeRoom.name}...`}
                  className="flex-1 rounded-xl border border-white/20 bg-[oklch(0.08_0.038_152/0.85)] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#fcba03]/55 focus:outline-none focus:ring-1 focus:ring-[#fcba03]/40"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fcba03] text-[oklch(0.18_0.04_155)] transition-colors hover:bg-[#e5ab03] disabled:opacity-40"
                  aria-label={sending ? 'Sending…' : 'Send reply'}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            ) : (
              <Link
                href={chatListBase}
                className="block border-t border-white/10 bg-[oklch(0.095_0.042_152/0.97)] py-2.5 text-center text-xs font-medium text-[#fcba03] backdrop-blur-sm transition-colors hover:bg-[oklch(0.14_0.05_152/0.9)]"
              >
                Open All Chats →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
