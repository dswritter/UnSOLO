'use client'

import { useEffect, useRef, useState } from 'react'
import { useRealtimeChat } from '@/hooks/useRealtimeChat'
import { sendMessage } from '@/actions/chat'
import { requestPhoneAccess } from '@/actions/profile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { Send, Wifi, WifiOff, Phone, Lock, X, User, Share2, Package, Check, CheckCheck, ArrowLeft, MoreVertical, LogOut, BellOff, Bell } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { Message, Profile } from '@/types'

interface ReadReceipt {
  message_id: string
  user_id: string
  read_at: string
}

interface MentionSuggestion {
  id: string
  username: string
  full_name: string | null
}

interface ChatWindowProps {
  roomId: string
  roomName: string
  roomType?: 'trip' | 'general' | 'direct'
  initialMessages: Message[]
  currentUser: Profile
  memberProfiles?: ChatMemberProfile[]
  onBack?: () => void
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
function renderMessageContent(content: string, isOwn: boolean = false) {
  const lines = content.split('\n')

  // On sender bubble (amber bg), links must be dark; on receiver (dark bg), links are amber
  const linkClass = isOwn
    ? 'text-black underline font-semibold hover:text-black/70 break-all'
    : 'text-primary underline hover:text-primary/80 break-all'
  const pkgBtnClass = isOwn
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/15 text-black text-xs font-semibold hover:bg-black/25 transition-colors'
    : 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors'

  return lines.map((line, lineIdx) => {
    // First, handle @mentions
    const mentionRegex = /@(\w+)/g
    const urlRegex = /(https?:\/\/[^\s<]+)/g

    // Split by URLs first, then handle mentions within text parts
    const parts = line.split(urlRegex)

    const lineContent = parts.map((part, partIdx) => {
      const key = `${lineIdx}-${partIdx}`
      if (/^https?:\/\//.test(part)) {
        const pkgMatch = part.match(/\/packages\/([a-z0-9-]+)/)
        if (pkgMatch) {
          return (
            <Link key={key} href={`/packages/${pkgMatch[1]}`} className={pkgBtnClass} onClick={e => e.stopPropagation()}>
              <Package className="h-3 w-3" />
              View Trip Package
            </Link>
          )
        }
        return (
          <a key={key} href={part} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={e => e.stopPropagation()}>
            {part.length > 60 ? part.slice(0, 57) + '...' : part}
          </a>
        )
      }
      // Handle @mentions in text parts
      if (part && /@\w+/.test(part)) {
        const mentionParts = part.split(/(@\w+)/g)
        return (
          <span key={key}>
            {mentionParts.map((mp, mi) => {
              if (mp.startsWith('@')) {
                const username = mp.slice(1)
                return (
                  <Link
                    key={`${key}-m${mi}`}
                    href={`/profile/${username}`}
                    className={isOwn
                      ? 'font-bold text-black/80 hover:underline'
                      : 'font-bold text-primary hover:underline'
                    }
                    onClick={e => e.stopPropagation()}
                  >
                    {mp}
                  </Link>
                )
              }
              return mp
            })}
          </span>
        )
      }
      return part ? <span key={key}>{part}</span> : null
    })

    return (
      <span key={lineIdx}>
        {lineContent}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    )
  })
}

export function ChatWindow({ roomId, roomName, roomType = 'general', initialMessages, currentUser, memberProfiles = [], onBack }: ChatWindowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dbOnlineUsers, setDbOnlineUsers] = useState<Set<string>>(new Set())
  const { messages, typingUsers, isConnected, broadcastTyping, onlineUsers, addOptimisticMessage } = useRealtimeChat(roomId, initialMessages, currentUser)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [profilePopup, setProfilePopup] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [showPackagePicker, setShowPackagePicker] = useState(false)
  const [packages, setPackages] = useState<{ slug: string; title: string; destination_name: string }[]>([])
  const [pkgSearch, setPkgSearch] = useState('')
  const typingThrottleRef = useRef<NodeJS.Timeout | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Read receipts state
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceipt[]>>(new Map())
  const [readByPopup, setReadByPopup] = useState<string | null>(null) // message_id for long-press popup
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  // Chat menu state
  const [showMenu, setShowMenu] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load and subscribe to read receipts
  useEffect(() => {
    const sb = createBrowserClient()
    // Filter out optimistic messages (they don't exist in DB yet)
    const realMsgIds = messages
      .filter(m => m.message_type !== 'system' && !m.id.startsWith('optimistic-'))
      .map(m => m.id)
    if (realMsgIds.length === 0) return

    async function loadReceipts() {
      const { data, error } = await sb
        .from('message_read_receipts')
        .select('message_id, user_id, read_at')
        .in('message_id', realMsgIds.slice(-50)) // last 50 messages only for perf
      if (error) {
        console.warn('Failed to load read receipts:', error.message)
        return
      }
      if (data) {
        const map = new Map<string, ReadReceipt[]>()
        for (const r of data) {
          const existing = map.get(r.message_id) || []
          existing.push(r)
          map.set(r.message_id, existing)
        }
        setReadReceipts(map)
      }
    }

    loadReceipts()

    // Poll receipts every 5s as fallback (realtime may not be configured)
    const pollInterval = setInterval(loadReceipts, 5000)

    // Subscribe to new read receipts for this room's messages
    const channel = sb
      .channel(`read-receipts-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_read_receipts',
      }, (payload) => {
        const r = payload.new as ReadReceipt
        setReadReceipts(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(r.message_id) || []
          if (!existing.find(e => e.user_id === r.user_id)) {
            newMap.set(r.message_id, [...existing, r])
          }
          return newMap
        })
      })
      .subscribe()

    return () => { clearInterval(pollInterval); sb.removeChannel(channel) }
  }, [messages, roomId])

  // Mark messages as read when viewing
  useEffect(() => {
    const sb = createBrowserClient()
    // Small delay so the page is actually visible before marking as read
    const timer = setTimeout(async () => {
      // Try RPC first (bulk mark), fall back to individual inserts
      const { error: rpcError } = await sb.rpc('mark_room_messages_read', { p_room_id: roomId, p_user_id: currentUser.id })
      if (rpcError) {
        console.warn('RPC mark_room_messages_read failed:', rpcError.message, '- falling back to direct inserts')
        // Fallback: insert read receipts for other users' messages directly
        const otherMsgs = messages
          .filter(m => m.user_id !== currentUser.id && m.message_type !== 'system' && !m.id.startsWith('optimistic-'))
          .slice(-30) // last 30 only
        for (const msg of otherMsgs) {
          await sb.from('message_read_receipts')
            .upsert({ message_id: msg.id, user_id: currentUser.id }, { onConflict: 'message_id,user_id' })
        }
      }

      // After marking as read, reload receipts so ticks update
      const realMsgIds = messages
        .filter(m => m.message_type !== 'system' && !m.id.startsWith('optimistic-'))
        .map(m => m.id)
      if (realMsgIds.length > 0) {
        const { data } = await sb
          .from('message_read_receipts')
          .select('message_id, user_id, read_at')
          .in('message_id', realMsgIds.slice(-50))
        if (data) {
          const map = new Map<string, ReadReceipt[]>()
          for (const r of data) {
            const existing = map.get(r.message_id) || []
            existing.push(r)
            map.set(r.message_id, existing)
          }
          setReadReceipts(map)
        }
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [messages, roomId, currentUser.id])

  // Mobile keyboard handler — adjust scroll on virtual keyboard
  useEffect(() => {
    function handleResize() {
      // On mobile, viewport resize means keyboard opened/closed
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleResize)
      return () => vv.removeEventListener('resize', handleResize)
    }
  }, [])

  // Poll presence table for accurate online status (not just realtime channel)
  useEffect(() => {
    const memberIds = memberProfiles.map(m => m.id)
    if (memberIds.length === 0) return

    const sb = createBrowserClient()

    async function checkPresence() {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
      const { data } = await sb
        .from('user_presence')
        .select('user_id')
        .in('user_id', memberIds)
        .eq('is_online', true)
        .gte('last_seen', oneMinAgo)
      if (data) {
        setDbOnlineUsers(new Set(data.map((d: { user_id: string }) => d.user_id)))
      }
    }

    checkPresence()
    const interval = setInterval(checkPresence, 15000)

    // Subscribe to presence table changes for instant updates
    const channel = sb
      .channel('chat-presence-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => {
        checkPresence()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      sb.removeChannel(channel)
    }
  }, [memberProfiles, roomId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Show message instantly (optimistic UI)
    addOptimisticMessage(content)

    setSending(true)
    const result = await sendMessage(roomId, content)
    if (result.error) {
      toast.error(result.error)
      setInput(content)
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Handle @mention navigation
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionSuggestions[mentionIndex].username)
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        setMentionSuggestions([])
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const pos = e.target.selectionStart || 0
    setInput(val)
    setCursorPos(pos)
    autoResizeTextarea()

    // Check for @mention trigger
    const textBeforeCursor = val.slice(0, pos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)
    if (mentionMatch && !isDM) {
      const query = mentionMatch[1].toLowerCase()
      setMentionQuery(query)
      const filtered = memberProfiles
        .filter(m => m.id !== currentUser.id)
        .filter(m =>
          m.username.toLowerCase().includes(query) ||
          (m.full_name || '').toLowerCase().includes(query)
        )
        .slice(0, 5)
      setMentionSuggestions(filtered.map(m => ({ id: m.id, username: m.username, full_name: m.full_name })))
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionSuggestions([])
    }

    // Throttle typing broadcast
    if (!typingThrottleRef.current) {
      broadcastTyping()
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null
      }, 2000)
    }
  }

  function insertMention(username: string) {
    const textBeforeCursor = input.slice(0, cursorPos)
    const mentionStart = textBeforeCursor.lastIndexOf('@')
    const before = input.slice(0, mentionStart)
    const after = input.slice(cursorPos)
    const newInput = `${before}@${username} ${after}`
    setInput(newInput)
    setMentionQuery(null)
    setMentionSuggestions([])
    textareaRef.current?.focus()
  }

  // Long press handlers for read-by popup
  function handleMessageLongPressStart(messageId: string) {
    longPressTimer.current = setTimeout(() => {
      setReadByPopup(messageId)
    }, 500) // 500ms long press
  }

  function handleMessageLongPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Get read status for a message
  function getReadStatus(messageId: string, senderId: string): 'sending' | 'sent' | 'read' {
    // Optimistic messages have no tick yet
    if (messageId.startsWith('optimistic-')) return 'sending'

    const receipts = readReceipts.get(messageId) || []
    if (isDM) {
      const otherRead = receipts.find(r => r.user_id !== senderId)
      return otherRead ? 'read' : 'sent'
    }
    return receipts.length > 0 ? 'read' : 'sent'
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
    const shareText = `Check out this trip: ${title}\n${url}`
    // Remove any previously shared package URL from input, then append new one
    const existingText = input.replace(/\nCheck out this trip:.*\nhttps?:\/\/[^\s]+/g, '').replace(/^Check out this trip:.*\nhttps?:\/\/[^\s]+/g, '').trim()
    setInput(existingText ? `${existingText}\n${shareText}` : shareText)
    setShowPackagePicker(false)
    setPkgSearch('')
    setTimeout(autoResizeTextarea, 50)
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
    return onlineUsers.includes(userId) || dbOnlineUsers.has(userId)
  }

  const popupMember = profilePopup ? getMemberProfile(profilePopup) : null
  const onlineCount = memberProfiles.filter(m => isUserOnline(m.id)).length
  const isDM = roomType === 'direct'
  const dmPartner = isDM ? memberProfiles.find(m => m.id !== currentUser.id) : null
  const dmPartnerOnline = dmPartner ? isUserOnline(dmPartner.id) : false

  // Auto-resize textarea
  function autoResizeTextarea() {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/community" className="text-muted-foreground hover:text-foreground transition-colors md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
          <h2 className="font-bold">{roomName}</h2>
          {isDM ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {dmPartnerOnline ? (
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-green-500 rounded-full inline-block" /> Online</span>
              ) : (
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-zinc-500 rounded-full inline-block" /> Offline</span>
              )}
            </div>
          ) : (
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
          )}
          </div>
        </div>

        {/* Chat menu — Leave / Mute (for group and trip chats) */}
        {!isDM && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl py-1 w-44">
                  <button
                    onClick={() => { setIsMuted(!isMuted); setShowMenu(false); toast.success(isMuted ? 'Notifications unmuted' : 'Notifications muted') }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-secondary/50 transition-colors"
                  >
                    {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    onClick={async () => {
                      setShowMenu(false)
                      const confirmed = window.confirm('Leave this chat room? You can rejoin later.')
                      if (!confirmed) return
                      const sb = (await import('@/lib/supabase/client')).createClient()
                      // Post system message that user left
                      await sb.from('messages').insert({
                        room_id: roomId,
                        user_id: null,
                        content: `${currentUser.full_name || currentUser.username} left the chat`,
                        message_type: 'system',
                      })
                      await sb.from('chat_room_members').delete().eq('room_id', roomId).eq('user_id', currentUser.id)
                      toast.success('Left the chat room')
                      // Navigate back to community
                      window.location.href = '/community'
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-secondary/50 transition-colors text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Leave Chat
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Online members strip (group chats only) */}
      {!isDM && onlineCount > 0 && (
        <div className="px-4 py-1.5 border-b border-border/50 bg-secondary/20 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <span className="text-[10px] text-green-400 font-medium shrink-0 mr-1">Online:</span>
          {memberProfiles
            .filter(m => isUserOnline(m.id))
            .map(m => (
              <Link key={m.id} href={`/profile/${m.username}`} className="shrink-0 group/avatar" title={m.full_name || m.username}>
                <div className="relative">
                  <Avatar className="h-6 w-6 ring-1 ring-green-500/50 group-hover/avatar:ring-green-400 transition-all">
                    <AvatarImage src={m.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-bold">
                      {getInitials(m.full_name || m.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full border border-background" />
                </div>
              </Link>
            ))}
        </div>
      )}

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
                  popupMember.phone_public === true || popupMember.phone_request_status === 'approved' ? (
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

              {popupMember.phone_number && popupMember.phone_public !== true && popupMember.phone_request_status !== 'approved' && (
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No messages yet. Say hello! 👋</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              onTouchStart={() => msg.message_type !== 'system' && handleMessageLongPressStart(msg.id)}
              onTouchEnd={handleMessageLongPressEnd}
              onMouseDown={() => msg.message_type !== 'system' && !isDM && handleMessageLongPressStart(msg.id)}
              onMouseUp={handleMessageLongPressEnd}
              onMouseLeave={handleMessageLongPressEnd}
            >
              <MessageBubble
                message={msg}
                isOwn={msg.user_id === currentUser.id}
                isOnline={msg.user_id ? isUserOnline(msg.user_id) : false}
                onClickProfile={() => msg.user_id && msg.user_id !== currentUser.id && setProfilePopup(msg.user_id)}
                readStatus={msg.user_id === currentUser.id ? getReadStatus(msg.id, currentUser.id) : undefined}
                isDM={isDM}
              />
            </div>
          ))}

          {/* Read-by popup (long-press on group messages) */}
          {readByPopup && !isDM && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setReadByPopup(null)}>
              <div className="bg-card border border-border rounded-xl p-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold">Read by</span>
                  <button onClick={() => setReadByPopup(null)}><X className="h-4 w-4 text-zinc-500" /></button>
                </div>
                {(() => {
                  const receipts = readReceipts.get(readByPopup) || []
                  if (receipts.length === 0) return <p className="text-xs text-muted-foreground">No one has read this yet</p>
                  return (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {receipts.map(r => {
                        const member = getMemberProfile(r.user_id)
                        return (
                          <div key={r.user_id} className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={member?.avatar_url || ''} />
                              <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-bold">
                                {getInitials(member?.full_name || member?.username || '?')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{member?.full_name || member?.username || 'Unknown'}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(r.read_at)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
          {typingUsers.length > 0 && (
            <div className="text-xs text-muted-foreground italic">
              {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Package Picker — in-flow, shrinks the scroll area above */}
      {showPackagePicker && (
        <div className="border-t border-border bg-card px-4 py-4 max-h-[60vh] min-h-[300px] overflow-y-auto shrink-0">
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

      {/* @Mention suggestions popup */}
      {mentionSuggestions.length > 0 && (
        <div className="px-4 pb-1">
          <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {mentionSuggestions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => insertMention(s.username)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === mentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50'
                }`}
              >
                <span className="font-medium">@{s.username}</span>
                {s.full_name && <span className="text-xs text-muted-foreground">{s.full_name}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 pb-6 border-t border-border safe-area-bottom mb-1">
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
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
            rows={1}
            className="bg-secondary border-border resize-none min-h-[40px] max-h-[160px] overflow-y-auto"
            style={{ height: 'auto' }}
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

function MessageBubble({ message, isOwn, isOnline, readStatus, isDM }: { message: Message; isOwn: boolean; isOnline: boolean; onClickProfile: () => void; readStatus?: 'sending' | 'sent' | 'read'; isDM?: boolean }): React.ReactNode {
  const user = message.user
  const name = user?.full_name || user?.username || 'Unknown'
  const profileUrl = user?.username ? `/profile/${user.username}` : '#'

  if (message.message_type === 'system') {
    // Make usernames in system messages clickable
    // Pattern: "Username (@handle) has joined" or "Username left the chat"
    const joinMatch = message.content.match(/^(.+?) \(@(\w+)\) has joined/)
    const leftMatch = message.content.match(/^(.+?) left the chat$/)

    if (joinMatch) {
      return (
        <div className="text-center">
          <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
            <Link href={`/profile/${joinMatch[2]}`} className="text-primary hover:underline font-medium">{joinMatch[1]}</Link> joined the chat
          </span>
        </div>
      )
    }

    if (leftMatch) {
      return (
        <div className="text-center">
          <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
            <span className="font-medium">{leftMatch[1]}</span> left the chat
          </span>
        </div>
      )
    }

    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  // Render @mentions as links in message content
  function renderWithMentions(content: string, ownMsg: boolean) {
    const rendered = renderMessageContent(content, ownMsg)
    // Post-process: find @username patterns and make them links
    return rendered
  }

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''} group`}>
      {!isOwn ? (
        <Link href={profileUrl} className="focus:outline-none flex-shrink-0 mt-0.5">
          <div className="relative">
            <Avatar className="h-7 w-7 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
              <AvatarImage src={user?.avatar_url || ''} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full border border-background" />
            )}
          </div>
        </Link>
      ) : (
        <div className="flex-shrink-0 mt-0.5">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className={`max-w-[75%] space-y-0.5 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <Link href={profileUrl} className="text-xs text-muted-foreground font-medium hover:text-primary transition-colors flex items-center gap-1">
            {name}
            {isOnline && <span className="h-1.5 w-1.5 bg-green-500 rounded-full inline-block" />}
          </Link>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-primary text-black rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm'
          }`}
        >
          {renderWithMentions(message.content, isOwn)}
        </div>
        <div className={`flex items-center gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-muted-foreground">{timeAgo(message.created_at)}</span>
          {/* Read receipt ticks — only for own messages */}
          {isOwn && readStatus && readStatus !== 'sending' && (
            <span className="flex items-center">
              {readStatus === 'read' ? (
                <CheckCheck className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Check className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          )}
          {/* Long-press hint for group messages */}
          {!isDM && !isOwn && (
            <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity">hold to see readers</span>
          )}
        </div>
      </div>
    </div>
  )
}
