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
  const inputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  const isOnChatPage = pathname?.startsWith('/chat')

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
        async (payload) => {
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
            .select('name')
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

          // Auto-set active room to the latest notification room
          if (!activeRoom) {
            setActiveRoom({ id: msg.room_id, name: room?.name || 'Chat' })
          }

          setTimeout(() => setMinimized(true), 8000)
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
    setSending(true)
    const result = await sendMessage(activeRoom.id, replyText.trim())
    if (result.error) {
      toast.error(result.error)
    } else {
      setReplyText('')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  function openRoomChat(roomId: string, roomName: string) {
    setActiveRoom({ id: roomId, name: roomName })
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  if (isOnChatPage || dismissed || notifications.length === 0) return null

  // Group notifications by room
  const roomMap = new Map<string, ChatNotification[]>()
  notifications.forEach(n => {
    const existing = roomMap.get(n.room_id) || []
    existing.push(n)
    roomMap.set(n.room_id, existing)
  })

  const activeRoomNotifications = activeRoom ? (roomMap.get(activeRoom.id) || []) : []

  return (
    <div className="fixed bottom-0 right-0 z-50 p-4 pointer-events-none" style={{ maxHeight: '100vh' }}>
      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          className="pointer-events-auto relative bg-primary text-black rounded-full h-14 w-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {notifications.length}
          </span>
        </button>
      ) : (
        <div className="pointer-events-auto w-[400px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
          {/* Header */}
          <div className="px-4 py-3 bg-secondary/50 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              {activeRoom ? activeRoom.name : 'New Messages'}
            </span>
            <div className="flex items-center gap-1">
              {activeRoom && (
                <button onClick={() => setActiveRoom(null)} className="text-muted-foreground hover:text-foreground p-1" title="Back to all messages">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              )}
              <Link href={activeRoom ? `/chat/${activeRoom.id}` : '/chat'} className="text-muted-foreground hover:text-foreground p-1" title="Open full chat">
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
              <button onClick={() => setMinimized(true)} className="text-muted-foreground hover:text-foreground p-1" title="Minimize to icon">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground p-1" title="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeRoom ? (
              // Show messages for active room
              activeRoomNotifications.length > 0 ? (
                activeRoomNotifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0">
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                      <AvatarImage src={n.user?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {getInitials(n.user?.full_name || n.user?.username || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium truncate">{n.user?.full_name || n.user?.username || 'Someone'}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">{n.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">No recent messages in this room</div>
              )
            ) : (
              // Show all notifications grouped
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openRoomChat(n.room_id, n.room_name)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0 w-full text-left"
                >
                  <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                    <AvatarImage src={n.user?.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {getInitials(n.user?.full_name || n.user?.username || '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium truncate">{n.user?.full_name || n.user?.username || 'Someone'}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-[10px] text-primary/70 truncate">{n.room_name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{n.content}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Reply bar (only when a room is active) */}
          {activeRoom ? (
            <form onSubmit={handleReply} className="px-3 py-2 border-t border-border flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={`Reply in ${activeRoom.name}...`}
                className="flex-1 text-sm bg-secondary border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sending}
                className="bg-primary text-black rounded-lg h-9 w-9 flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <Link
              href="/chat"
              className="block text-center py-2.5 text-xs text-primary font-medium hover:bg-secondary/30 transition-colors border-t border-border"
            >
              Open All Chats →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
