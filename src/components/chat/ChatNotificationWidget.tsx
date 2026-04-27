'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/actions/chat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageCircle, X, Maximize2, Minus, Send, ArrowLeft } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { playNotificationSound, sendSystemNotification, preloadSound } from '@/lib/notifications/soundController'

interface ChatNotification {
  id: string
  room_id: string
  room_name: string
  content: string
  created_at: string
  user?: {
    username: string
    full_name: string | null
    avatar_url: string | null
  }
}

export function ChatNotificationWidget({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<ChatNotification[]>([])
  const [minimized, setMinimized] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [activeRoom, setActiveRoom] = useState<{ id: string; name: string } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMessages, setSentMessages] = useState<ChatNotification[]>([])
  const [userInteracting, setUserInteracting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoMinimizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pathname = usePathname()
  const chatListBase = pathname?.startsWith('/tribe') ? '/tribe' : '/community'

  const isOnChatPage =
    pathname?.startsWith('/chat') || pathname?.startsWith('/community') || pathname?.startsWith('/tribe')

  // Preload notification sound
  useEffect(() => { preloadSound() }, [])

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

          const { data: membership } = await supabase
            .from('chat_room_members')
            .select('id')
            .eq('room_id', msg.room_id)
            .eq('user_id', userId)
            .single()

          if (!membership) return

          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', msg.user_id)
            .single()

          const { data: room } = await supabase
            .from('chat_rooms')
            .select('name, type')
            .eq('id', msg.room_id)
            .single()

          const notification: ChatNotification = {
            id: msg.id,
            room_id: msg.room_id,
            room_name: room?.name || 'Chat',
            content: msg.content,
            created_at: msg.created_at,
            user: senderProfile || undefined,
          }

          setNotifications(prev => [notification, ...prev].slice(0, 8))
          setDismissed(false)
          setMinimized(false)
          // Auto-scroll to latest message
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

          // Play notification sound
          playNotificationSound({
            messageRoomId: msg.room_id,
            activeRoomId: activeRoom?.id || null,
            roomType: (room?.type as 'direct' | 'trip' | 'general') || 'general',
            unreadCount: 0, // Widget always plays on first new message
            isTyping: false,
          })

          // System notification for inactive tabs
          sendSystemNotification(
            senderProfile?.full_name || senderProfile?.username || 'New message',
            msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content,
          )

          // Auto-set active room to the latest notification room
          if (!activeRoom) {
            setActiveRoom({ id: msg.room_id, name: room?.name || 'Chat' })
          }

          // Auto-minimize after 8s ONLY if user is not interacting
          if (autoMinimizeTimerRef.current) clearTimeout(autoMinimizeTimerRef.current)
          autoMinimizeTimerRef.current = setTimeout(() => {
            setMinimized(prev => {
              // Only minimize if user hasn't started typing
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

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !activeRoom || sending) return
    const msgText = replyText.trim()
    setSending(true)
    const result = await sendMessage(activeRoom.id, msgText)
    if (result.error) {
      toast.error(result.error)
    } else {
      setReplyText('')
      // Add sent message to local state so it appears in the mini chat
      setSentMessages(prev => [...prev, {
        id: `sent-${Date.now()}`,
        room_id: activeRoom.id,
        room_name: activeRoom.name,
        content: msgText,
        created_at: new Date().toISOString(),
        user: { username: 'You', full_name: 'You', avatar_url: null },
      }])
      // Scroll to bottom after sending
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  function openRoomChat(roomId: string, roomName: string) {
    setActiveRoom({ id: roomId, name: roomName })
    setUserInteracting(true)
    // Cancel auto-minimize when user explicitly opens a room
    if (autoMinimizeTimerRef.current) {
      clearTimeout(autoMinimizeTimerRef.current)
      autoMinimizeTimerRef.current = null
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  if (isOnChatPage) return null
  // Dismissed = hide button until next new message arrives
  if (dismissed && notifications.length === 0) return null

  // Group notifications by room
  const roomMap = new Map<string, ChatNotification[]>()
  notifications.forEach(n => {
    const existing = roomMap.get(n.room_id) || []
    existing.push(n)
    roomMap.set(n.room_id, existing)
  })

  // Combine received notifications + sent messages, reverse so newest at bottom
  const activeRoomNotifications = activeRoom ? [
    ...(roomMap.get(activeRoom.id) || []),
    ...sentMessages.filter(m => m.room_id === activeRoom.id),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []

  const iconBtn =
    'rounded-lg p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fcba03]/60'

  return (
    <div className="fixed bottom-20 right-6 z-50 pointer-events-none md:bottom-6">
      {minimized || notifications.length === 0 ? (
        <button
          type="button"
          onClick={() => notifications.length > 0 ? setMinimized(false) : (window.location.href = chatListBase)}
          className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-[#fcba03] text-[oklch(0.18_0.04_155)] shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-2 ring-white/15 transition-all hover:scale-105 hover:bg-[#e5ab03]"
          aria-label={notifications.length > 0 ? 'Open chat notifications' : 'Open chats'}
        >
          <MessageCircle className="h-6 w-6" />
          {notifications.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {notifications.length}
            </span>
          )}
        </button>
      ) : (
        <div
          className="pointer-events-auto relative mb-2 flex w-[400px] max-w-[calc(100vw-4rem)] flex-col overflow-hidden rounded-2xl border border-white/15 shadow-[0_12px_48px_rgba(0,0,0,0.45)] wander-theme text-white [color-scheme:dark]"
          style={{ height: '380px', maxHeight: 'calc(100vh - 8rem)' }}
        >
          {/* Forest + northern-lights wash (scoped; matches /tribe wander-textured vibe) */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl" aria-hidden>
            <div className="absolute inset-0 wander-textured" />
            <div
              className="absolute -left-[20%] top-0 h-[72%] w-[140%] opacity-[0.85] mix-blend-screen blur-2xl"
              style={{
                background:
                  'radial-gradient(ellipse 75% 55% at 35% 0%, oklch(0.58 0.14 200 / 0.42) 0%, transparent 58%), radial-gradient(ellipse 55% 45% at 78% 15%, oklch(0.62 0.18 305 / 0.28) 0%, transparent 52%), radial-gradient(ellipse 90% 40% at 50% 100%, oklch(0.45 0.12 165 / 0.35) 0%, transparent 55%)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />
          </div>

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md">
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
                <button type="button" onClick={() => { setDismissed(true); setNotifications([]); setMinimized(true) }} className={iconBtn} title="Dismiss until next message">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-black/15">
              {activeRoom ? (
                activeRoomNotifications.length > 0 ? (
                  <>
                    {activeRoomNotifications.map((n) => {
                      const isSent = n.id.startsWith('sent-')
                      return (
                        <div key={n.id} className={`flex items-start gap-3 px-4 py-2.5 ${isSent ? 'flex-row-reverse' : ''}`}>
                          <Avatar className="mt-0.5 h-7 w-7 shrink-0 border border-white/10">
                            <AvatarImage src={n.user?.avatar_url || ''} />
                            <AvatarFallback className="bg-white/15 text-[10px] font-bold text-[#fcba03]">
                              {getInitials(n.user?.full_name || n.user?.username || '?')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`flex max-w-[75%] flex-col ${isSent ? 'items-end' : 'items-start'}`}>
                            {!isSent && (
                              <span className="mb-0.5 text-[10px] font-medium text-white/60">{n.user?.full_name || n.user?.username}</span>
                            )}
                            <div
                              className={`break-words rounded-2xl px-3 py-1.5 text-sm text-white shadow-inner backdrop-blur-md ${
                                isSent
                                  ? 'rounded-tr-sm border border-[#fcba03]/45 bg-[#fcba03]/18'
                                  : 'rounded-tl-sm border border-white/15 bg-white/10'
                              }`}
                            >
                              {n.content}
                            </div>
                            <span className="mt-0.5 text-[9px] text-white/45">{timeAgo(n.created_at)}</span>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="px-4 py-6 text-center text-xs text-white/55">No recent messages in this room</div>
                )
              ) : (
                notifications.map((n) => (
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
                ))
              )}
            </div>

            {/* Reply bar */}
            {activeRoom ? (
              <form onSubmit={handleReply} className="flex gap-2 border-t border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={e => { setReplyText(e.target.value); setUserInteracting(true) }}
                  onFocus={() => { setUserInteracting(true); if (autoMinimizeTimerRef.current) { clearTimeout(autoMinimizeTimerRef.current); autoMinimizeTimerRef.current = null } }}
                  placeholder={`Reply in ${activeRoom.name}...`}
                  className="flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#fcba03]/55 focus:outline-none focus:ring-1 focus:ring-[#fcba03]/40"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fcba03] text-[oklch(0.18_0.04_155)] transition-colors hover:bg-[#e5ab03] disabled:opacity-40"
                  aria-label="Send reply"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <Link
                href={chatListBase}
                className="block border-t border-white/10 bg-black/30 py-2.5 text-center text-xs font-medium text-[#fcba03] backdrop-blur-md transition-colors hover:bg-white/10"
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
