'use client'

import { useEffect, useRef, useState } from 'react'
import { useRealtimeChat } from '@/hooks/useRealtimeChat'
import { sendMessage } from '@/actions/chat'
import { requestPhoneAccess } from '@/actions/profile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Wifi, WifiOff, Phone, Lock, X, User, Share2, Package } from 'lucide-react'
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
  phone_request_status?: string | null
}

// ── Linkify helper ─────────────────────────────────────────
function renderMessageContent(content: string) {
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  const parts = content.split(urlRegex)

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Check if it's a package link
      const pkgMatch = part.match(/\/packages\/([a-z0-9-]+)/)
      if (pkgMatch) {
        return (
          <Link
            key={i}
            href={`/packages/${pkgMatch[1]}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Package className="h-3 w-3" />
            View Trip Package
          </Link>
        )
      }
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80 break-all"
          onClick={e => e.stopPropagation()}
        >
          {part.length > 60 ? part.slice(0, 57) + '...' : part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function ChatWindow({ roomId, roomName, initialMessages, currentUser, memberProfiles = [] }: ChatWindowProps) {
  const { messages, typingUsers, isConnected, broadcastTyping, onlineUsers } = useRealtimeChat(roomId, initialMessages, currentUser)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [profilePopup, setProfilePopup] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [showPackagePicker, setShowPackagePicker] = useState(false)
  const [packages, setPackages] = useState<{ slug: string; title: string; destination_name: string }[]>([])
  const [pkgSearch, setPkgSearch] = useState('')
  const typingThrottleRef = useRef<NodeJS.Timeout | null>(null)
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

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Throttle typing broadcast to once every 2s
    if (!typingThrottleRef.current) {
      broadcastTyping()
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null
      }, 2000)
    }
  }

  async function loadPackages() {
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { data } = await supabase
      .from('packages')
      .select('slug, title, destination:destinations(name)')
      .eq('is_active', true)
      .order('title')
    if (data) {
      setPackages(data.map((p: Record<string, unknown>) => ({
        slug: p.slug as string,
        title: p.title as string,
        destination_name: (p.destination as { name: string } | null)?.name || '',
      })))
    }
  }

  function sharePackage(slug: string, title: string) {
    const url = `${window.location.origin}/packages/${slug}`
    setInput(`Check out this trip: ${title}\n${url}`)
    setShowPackagePicker(false)
    setPkgSearch('')
  }

  async function handleRequestPhone(targetId: string) {
    const result = await requestPhoneAccess(targetId)
    if (result.error) toast.error(result.error)
    else toast.success('Phone request sent!')
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

  function isUserOnline(userId: string): boolean {
    return onlineUsers.includes(userId)
  }

  const popupMember = profilePopup ? getMemberProfile(profilePopup) : null
  const onlineCount = memberProfiles.filter(m => isUserOnline(m.id)).length

  return (
    <div className="flex flex-col h-full bg-black border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-bold">{roomName}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isConnected ? (
              <span className="flex items-center gap-1"><Wifi className="h-3 w-3 text-green-400" /> Live</span>
            ) : (
              <span className="flex items-center gap-1"><WifiOff className="h-3 w-3 text-red-400" /> Connecting...</span>
            )}
            <span>·</span>
            <button onClick={() => setShowMembers(!showMembers)} className="hover:text-white transition-colors">
              <span className="text-green-400">{onlineCount}</span> online · {memberProfiles.length} members
            </button>
          </div>
        </div>
      </div>

      {/* Members sidebar (toggled) */}
      {showMembers && (
        <div className="border-b border-border px-4 py-3 bg-secondary/30 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Members</p>
            <button onClick={() => setShowMembers(false)}><X className="h-3 w-3 text-zinc-500" /></button>
          </div>
          <div className="space-y-1.5">
            {memberProfiles
              .sort((a, b) => {
                const aOnline = isUserOnline(a.id) ? 1 : 0
                const bOnline = isUserOnline(b.id) ? 1 : 0
                return bOnline - aOnline
              })
              .map(m => (
              <button
                key={m.id}
                className="flex items-center gap-2 w-full text-left hover:bg-secondary/50 rounded-md px-2 py-1 transition-colors"
                onClick={() => { setProfilePopup(m.id); setShowMembers(false) }}
              >
                <div className="relative">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                      {getInitials(m.full_name || m.username)}
                    </AvatarFallback>
                  </Avatar>
                  {isUserOnline(m.id) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-500 rounded-full border-2 border-black" />
                  )}
                </div>
                <span className="text-xs truncate">{m.full_name || m.username}</span>
                {m.id === currentUser.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profile popup overlay */}
      {popupMember && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setProfilePopup(null)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-xs space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={popupMember.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary font-bold">
                      {getInitials(popupMember.full_name || popupMember.username)}
                    </AvatarFallback>
                  </Avatar>
                  {isUserOnline(popupMember.id) && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
                  )}
                </div>
                <div>
                  <div className="font-bold">{popupMember.full_name || popupMember.username}</div>
                  <div className="text-xs text-muted-foreground">@{popupMember.username}</div>
                  {isUserOnline(popupMember.id) && (
                    <span className="text-[10px] text-green-400 font-medium">● Online now</span>
                  )}
                </div>
              </div>
              <button onClick={() => setProfilePopup(null)}><X className="h-4 w-4 text-zinc-500" /></button>
            </div>

            {popupMember.bio && <p className="text-sm text-muted-foreground">{popupMember.bio}</p>}

            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                {popupMember.phone_number ? (
                  popupMember.phone_public || popupMember.phone_request_status === 'approved' ? (
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
                  size="sm" variant="outline" className="mt-2 w-full border-border text-xs"
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
              isOnline={msg.user_id ? isUserOnline(msg.user_id) : false}
              onClickProfile={() => msg.user_id && msg.user_id !== currentUser.id && setProfilePopup(msg.user_id)}
            />
          ))}
          {typingUsers.length > 0 && (
            <div className="text-xs text-muted-foreground italic">
              {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Package Picker Popup */}
      {showPackagePicker && (
        <div className="border-t border-border bg-card/95 backdrop-blur px-4 py-4 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">Share a Trip Package</p>
            <button onClick={() => { setShowPackagePicker(false); setPkgSearch('') }}><X className="h-4 w-4 text-zinc-500 hover:text-white" /></button>
          </div>
          <input
            type="text"
            value={pkgSearch}
            onChange={e => setPkgSearch(e.target.value)}
            placeholder="Search packages..."
            className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-primary"
            autoFocus
          />
          <div className="space-y-1">
            {packages
              .filter(p => !pkgSearch || p.title.toLowerCase().includes(pkgSearch.toLowerCase()) || p.destination_name.toLowerCase().includes(pkgSearch.toLowerCase()))
              .slice(0, 10)
              .map(p => (
                <button
                  key={p.slug}
                  onClick={() => sharePackage(p.slug, p.title)}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/80 transition-colors border border-transparent hover:border-border"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground">{p.destination_name}</div>
                  </div>
                </button>
              ))}
            {packages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Loading packages...</p>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <button
            type="button"
            onClick={() => { setShowPackagePicker(!showPackagePicker); if (packages.length === 0) loadPackages() }}
            className="h-10 w-10 flex-shrink-0 rounded-lg border border-border bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            title="Share a trip package"
          >
            <Share2 className="h-4 w-4 text-primary" />
          </button>
          <Textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
            rows={1}
            className="bg-secondary border-border resize-none min-h-[40px] max-h-32"
          />
          <Button
            type="submit" size="sm"
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

function MessageBubble({ message, isOwn, isOnline, onClickProfile }: { message: Message; isOwn: boolean; isOnline: boolean; onClickProfile: () => void }) {
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
        <div className="relative">
          <Avatar className={`h-7 w-7 ${!isOwn ? 'cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all' : ''}`}>
            <AvatarImage src={user?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          {isOnline && !isOwn && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full border border-black" />
          )}
        </div>
      </button>
      <div className={`max-w-[75%] space-y-0.5 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <button onClick={onClickProfile} className="text-xs text-muted-foreground font-medium hover:text-primary transition-colors flex items-center gap-1">
            {name}
            {isOnline && <span className="h-1.5 w-1.5 bg-green-500 rounded-full inline-block" />}
          </button>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-primary text-black rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm'
          }`}
        >
          {renderMessageContent(message.content)}
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(message.created_at)}</span>
      </div>
    </div>
  )
}
