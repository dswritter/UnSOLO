'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageCircle, X, Maximize2 } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface ChatNotification {
  id: string
  room_id: string
  content: string
  created_at: string
  room_name?: string
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
  const pathname = usePathname()

  // Don't show on chat pages
  const isOnChatPage = pathname?.startsWith('/chat')

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // Subscribe to all new messages
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

          // Skip own messages and system messages
          if (msg.user_id === userId || msg.message_type === 'system') return

          // Check if user is a member of this room
          const { data: membership } = await supabase
            .from('chat_room_members')
            .select('id')
            .eq('room_id', msg.room_id)
            .eq('user_id', userId)
            .single()

          if (!membership) return

          // Get sender info
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', msg.user_id)
            .single()

          // Get room name
          const { data: room } = await supabase
            .from('chat_rooms')
            .select('name')
            .eq('id', msg.room_id)
            .single()

          const notification: ChatNotification = {
            id: msg.id,
            room_id: msg.room_id,
            content: msg.content,
            created_at: msg.created_at,
            room_name: room?.name || 'Chat',
            user: senderProfile || undefined,
          }

          setNotifications(prev => [notification, ...prev].slice(0, 5))
          setDismissed(false)
          setMinimized(false)

          // Auto-minimize after 5 seconds
          setTimeout(() => setMinimized(true), 5000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  if (isOnChatPage || dismissed || notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {minimized ? (
        /* Minimized: floating bubble */
        <button
          onClick={() => setMinimized(false)}
          className="relative bg-primary text-black rounded-full h-12 w-12 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {notifications.length}
          </span>
        </button>
      ) : (
        /* Expanded: chat preview panel */
        <div className="w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-secondary/50 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              New Messages
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(true)} className="text-muted-foreground hover:text-white p-1">
                <Maximize2 className="h-3.5 w-3.5 rotate-180" />
              </button>
              <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-white p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div className="max-h-64 overflow-y-auto">
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={`/chat/${n.room_id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
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
              </Link>
            ))}
          </div>

          {/* Footer */}
          <Link
            href="/chat"
            className="block text-center py-2 text-xs text-primary font-medium hover:bg-secondary/30 transition-colors border-t border-border"
          >
            Open All Chats →
          </Link>
        </div>
      )}
    </div>
  )
}
