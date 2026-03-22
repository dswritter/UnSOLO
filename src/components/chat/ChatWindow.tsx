'use client'

import { useEffect, useRef, useState } from 'react'
import { useRealtimeChat } from '@/hooks/useRealtimeChat'
import { sendMessage } from '@/actions/chat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Wifi, WifiOff } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import type { Message, Profile } from '@/types'

interface ChatWindowProps {
  roomId: string
  roomName: string
  initialMessages: Message[]
  currentUser: Profile
}

export function ChatWindow({ roomId, roomName, initialMessages, currentUser }: ChatWindowProps) {
  const { messages, typingUsers, isConnected } = useRealtimeChat(roomId, initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    const result = await sendMessage(roomId, content)
    if (result.error) {
      toast.error(result.error)
      setInput(content)
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex flex-col h-full bg-black border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-bold">{roomName}</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isConnected ? (
              <><Wifi className="h-3 w-3 text-green-400" /> Live</>
            ) : (
              <><WifiOff className="h-3 w-3 text-red-400" /> Connecting...</>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No messages yet. Say hello! 👋</p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.user_id === currentUser.id}
            />
          ))}
          {typingUsers.filter((u) => u !== currentUser.username).length > 0 && (
            <div className="text-xs text-muted-foreground italic">
              {typingUsers.filter((u) => u !== currentUser.username).join(', ')} is typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
            rows={1}
            className="bg-secondary border-border resize-none min-h-[40px] max-h-32"
          />
          <Button
            type="submit"
            size="sm"
            className="bg-primary text-black hover:bg-primary/90 h-10 w-10 p-0 flex-shrink-0"
            disabled={!input.trim() || sending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const user = message.user
  const name = user?.full_name || user?.username || 'Unknown'

  if (message.message_type === 'system') {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
        <AvatarImage src={user?.avatar_url || ''} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className={`max-w-[75%] space-y-0.5 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <span className="text-xs text-muted-foreground font-medium">{name}</span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-primary text-black rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm'
          }`}
        >
          {message.content}
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(message.created_at)}</span>
      </div>
    </div>
  )
}
