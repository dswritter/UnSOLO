'use client'

import { useEffect, useRef, useState } from 'react'
import { useRealtimeChat } from '@/hooks/useRealtimeChat'
import { sendMessage } from '@/actions/chat'
import { requestPhoneAccess } from '@/actions/profile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Wifi, WifiOff, Phone, Lock, Globe, X, User } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Message, Profile } from '@/types'

interface ChatWindowProps {
  roomId: string
  roomName: string
  initialMessages: Message[]
  currentUser: Profile
  memberProfiles?: ChatMemberProfile[]
}

export interface ChatMemberProfile {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  phone_number: string | null
  phone_public: boolean
  phone_request_status?: string | null // 'pending' | 'approved' | 'rejected' | null
}

export function ChatWindow({ roomId, roomName, initialMessages, currentUser, memberProfiles = [] }: ChatWindowProps) {
  const { messages, typingUsers, isConnected } = useRealtimeChat(roomId, initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [profilePopup, setProfilePopup] = useState<string | null>(null)
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

  async function handleRequestPhone(targetId: string) {
    const result = await requestPhoneAccess(targetId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Phone request sent! They will be notified.')
    }
    setProfilePopup(null)
  }

  function getMemberProfile(userId: string | null): ChatMemberProfile | undefined {
    if (!userId) return undefined
    return memberProfiles.find(m => m.id === userId)
  }

  function maskPhone(phone: string): string {
    if (phone.length <= 4) return '****'
    return phone.slice(0, 2) + '****' + phone.slice(-2)
  }

  const popupMember = profilePopup ? getMemberProfile(profilePopup) : null

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
            <span className="ml-2">{memberProfiles.length} member{memberProfiles.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Profile popup overlay */}
      {popupMember && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setProfilePopup(null)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-xs space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={popupMember.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold">
                    {getInitials(popupMember.full_name || popupMember.username)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold">{popupMember.full_name || popupMember.username}</div>
                  <div className="text-xs text-muted-foreground">@{popupMember.username}</div>
                </div>
              </div>
              <button onClick={() => setProfilePopup(null)}><X className="h-4 w-4 text-zinc-500" /></button>
            </div>

            {popupMember.bio && (
              <p className="text-sm text-muted-foreground">{popupMember.bio}</p>
            )}

            {/* Phone number section */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                {popupMember.phone_number ? (
                  popupMember.phone_public ? (
                    <span>{popupMember.phone_number}</span>
                  ) : popupMember.phone_request_status === 'approved' ? (
                    <span>{popupMember.phone_number}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{maskPhone(popupMember.phone_number)}</span>
                      <Lock className="h-3 w-3 text-zinc-500" />
                    </div>
                  )
                ) : (
                  <span className="text-muted-foreground text-xs">No phone added</span>
                )}
              </div>

              {popupMember.phone_number && !popupMember.phone_public && popupMember.phone_request_status !== 'approved' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full border-border text-xs"
                  onClick={() => handleRequestPhone(popupMember.id)}
                  disabled={popupMember.phone_request_status === 'pending'}
                >
                  {popupMember.phone_request_status === 'pending' ? 'Request Pending...' : 'Request Phone Number'}
                </Button>
              )}
            </div>

            <Button size="sm" variant="outline" className="w-full border-border text-xs" asChild>
              <Link href={`/profile/${popupMember.username}`}>
                <User className="mr-1 h-3 w-3" /> View Full Profile
              </Link>
            </Button>
          </div>
        </div>
      )}

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
              onClickProfile={() => msg.user_id && msg.user_id !== currentUser.id && setProfilePopup(msg.user_id)}
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

function MessageBubble({ message, isOwn, onClickProfile }: { message: Message; isOwn: boolean; onClickProfile: () => void }) {
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
      <button onClick={onClickProfile} className="focus:outline-none flex-shrink-0 mt-0.5" disabled={isOwn}>
        <Avatar className={`h-7 w-7 ${!isOwn ? 'cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all' : ''}`}>
          <AvatarImage src={user?.avatar_url || ''} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      </button>
      <div className={`max-w-[75%] space-y-0.5 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <button onClick={onClickProfile} className="text-xs text-muted-foreground font-medium hover:text-primary transition-colors">
            {name}
          </button>
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
