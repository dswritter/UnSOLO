'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeChat } from '@/hooks/useRealtimeChat'
import { sendMessage } from '@/actions/chat'
import { requestPhoneAccess } from '@/actions/profile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { Send, Wifi, WifiOff, Phone, Lock, X, User, Share2, Package, Check, CheckCheck, ArrowLeft, MoreVertical, LogOut, BellOff, Bell, SmilePlus } from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { Message, Profile } from '@/types'
import { consumeHashtagFragment, type ChatLinkTarget } from '@/lib/chat/chatHashTags'
import type { TripChatBookingPhase } from '@/lib/chat/tripChatAccess'

export type { ChatLinkTarget } from '@/lib/chat/chatHashTags'

function TripStatusBadge({ phase, className = '' }: { phase: TripChatBookingPhase; className?: string }) {
  const label = phase === 'upcoming' ? 'Booked' : phase === 'ongoing' ? 'On trip' : 'Completed'
  const cls =
    phase === 'upcoming'
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
      : phase === 'ongoing'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40'
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border ${cls} ${className}`}>{label}</span>
  )
}

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

/** Long-press picker + double-tap default (see Docs/Chat Reaction Emojis.md) */
const CHAT_QUICK_REACTIONS = ['👍', '😂', '🔥', '🤝', '🥳', '🙏', '❌', '🚀', '✅', '🧳', '🌄'] as const
const DOUBLE_TAP_EMOJI = '👍'

interface ChatWindowProps {
  roomId: string
  roomName: string
  roomType?: 'trip' | 'general' | 'direct'
  /** Community / trip room cover — tap to enlarge */
  roomImageUrl?: string | null
  initialMessages: Message[]
  currentUser: Profile
  memberProfiles?: ChatMemberProfile[]
  onBack?: () => void
  /** #slug → trip package slug or community room name slug */
  chatLinkTargets?: ChatLinkTarget[]
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
  /** Set for trip chats: booking phase vs package dates */
  trip_chat_badge?: TripChatBookingPhase | null
}

// ── Linkify: URLs, @mentions, #room-or-trip (slug, full name, unique prefix) ──
function renderTextWithMentionsAndTags(
  part: string,
  lineKey: string,
  isOwn: boolean,
  chatLinkTargets: ChatLinkTarget[],
) {
  const mentionClass = isOwn
    ? 'font-bold text-black/80 hover:underline'
    : 'font-bold text-primary hover:underline'
  const hashClass = isOwn
    ? 'font-semibold text-black/90 bg-black/10 px-0.5 rounded hover:underline'
    : 'font-semibold text-primary bg-primary/15 px-0.5 rounded hover:underline'

  const nodes: React.ReactNode[] = []
  let i = 0
  let k = 0
  while (i < part.length) {
    const c = part[i]
    if (c === '@') {
      const mm = part.slice(i).match(/^@(\w+)/)
      if (mm) {
        nodes.push(
          <Link
            key={`${lineKey}@${k}`}
            href={`/profile/${mm[1]}`}
            className={mentionClass}
            onClick={e => e.stopPropagation()}
          >
            {mm[0]}
          </Link>,
        )
        i += mm[0].length
        k++
        continue
      }
    }
    if (c === '#' && /[a-zA-Z0-9]/.test(part[i + 1] || '')) {
      const rest = part.slice(i + 1)
      const hit = consumeHashtagFragment(rest, chatLinkTargets)
      if (hit) {
        const display = rest.slice(0, hit.consumed)
        nodes.push(
          <Link
            key={`${lineKey}#${k}`}
            href={`/community/${hit.target.roomId}`}
            className={hashClass}
            onClick={e => e.stopPropagation()}
            title={hit.target.label}
          >
            #{display}
          </Link>,
        )
        i += 1 + hit.consumed
        k++
        continue
      }
      nodes.push(<span key={`${lineKey}#${k}`}>#</span>)
      i++
      k++
      continue
    }
    let j = i + 1
    while (j < part.length && part[j] !== '@' && part[j] !== '#') j++
    if (j > i) {
      nodes.push(<span key={`${lineKey}t${k}`}>{part.slice(i, j)}</span>)
      k++
    }
    i = j
  }
  return <span key={lineKey}>{nodes}</span>
}

function renderMessageContent(content: string, isOwn: boolean = false, chatLinkTargets: ChatLinkTarget[] = []) {
  const lines = content.split('\n')

  const linkClass = isOwn
    ? 'text-black underline font-semibold hover:text-black/70 break-all'
    : 'text-primary underline hover:text-primary/80 break-all'
  const pkgBtnClass = isOwn
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/15 text-black text-xs font-semibold hover:bg-black/25 transition-colors'
    : 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors'

  const urlRegex = /(https?:\/\/[^\s<]+)/g

  return lines.map((line, lineIdx) => {
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
      if (!part) return null
      return renderTextWithMentionsAndTags(part, key, isOwn, chatLinkTargets)
    })

    return (
      <span key={lineIdx}>
        {lineContent}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    )
  })
}

export function ChatWindow({
  roomId,
  roomName,
  roomType = 'general',
  roomImageUrl = null,
  initialMessages,
  currentUser,
  memberProfiles = [],
  onBack,
  chatLinkTargets = [],
}: ChatWindowProps) {
  const router = useRouter()
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

  // Chat menu state
  const [showMenu, setShowMenu] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [hashSuggestions, setHashSuggestions] = useState<ChatLinkTarget[]>([])
  const [hashIndex, setHashIndex] = useState(0)

  type ReactionRow = { id: string; message_id: string; user_id: string; emoji: string }
  const [reactionsByMessage, setReactionsByMessage] = useState<Map<string, ReactionRow[]>>(new Map())
  const reactionsByMessageRef = useRef(reactionsByMessage)
  reactionsByMessageRef.current = reactionsByMessage
  const [emojiPickerForMessageId, setEmojiPickerForMessageId] = useState<string | null>(null)
  const [roomImageLightbox, setRoomImageLightbox] = useState(false)
  const [reactorModal, setReactorModal] = useState<{ emoji: string; names: string[] } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ id: string; t: number } | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!emojiPickerForMessageId) return
    const onPointerDown = (e: PointerEvent) => {
      const root = document.querySelector(`[data-emoji-strip-root="${emojiPickerForMessageId}"]`)
      if (root?.contains(e.target as Node)) return
      setEmojiPickerForMessageId(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [emojiPickerForMessageId])

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
    const pollInterval = setInterval(loadReceipts, 60000)

    // Subscribe to new read receipts for this room's messages
    const channel = sb
      .channel(`read-receipts-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_read_receipts',
      }, (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as unknown as ReadReceipt
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

  // Message reactions: load + realtime
  useEffect(() => {
    const sb = createBrowserClient()
    const realIds = messages
      .filter(m => m.message_type !== 'system' && !m.id.startsWith('optimistic-'))
      .map(m => m.id)
    if (realIds.length === 0) {
      setReactionsByMessage(new Map())
      return
    }

    async function loadReactions() {
      const slice = realIds.slice(-80)
      const { data, error } = await sb
        .from('message_reactions')
        .select('id, message_id, user_id, emoji')
        .in('message_id', slice)
      if (error) {
        console.warn('message_reactions load:', error.message)
        return
      }
      const m = new Map<string, ReactionRow[]>()
      for (const r of data || []) {
        const row = r as ReactionRow
        const arr = m.get(row.message_id) || []
        arr.push(row)
        m.set(row.message_id, arr)
      }
      setReactionsByMessage(m)
    }

    void loadReactions()
    const pollRx = setInterval(() => void loadReactions(), 45000)

    function mergeInsert(r: ReactionRow) {
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        const arr = [...(next.get(r.message_id) || [])]
        if (!arr.some(x => x.id === r.id)) arr.push(r)
        next.set(r.message_id, arr)
        return next
      })
    }
    function mergeDelete(id: string, messageId: string) {
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        const arr = (next.get(messageId) || []).filter(x => x.id !== id)
        if (arr.length === 0) next.delete(messageId)
        else next.set(messageId, arr)
        return next
      })
    }

    function mergeDeleteByReactionId(id: string) {
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        for (const [msgId, rows] of next) {
          const filtered = rows.filter(x => x.id !== id)
          if (filtered.length !== rows.length) {
            if (filtered.length === 0) next.delete(msgId)
            else next.set(msgId, filtered)
            break
          }
        }
        return next
      })
    }

    const channel = sb
      .channel(`msg-rx-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` },
        (payload: { new: Record<string, unknown> }) => mergeInsert(payload.new as ReactionRow),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` },
        (payload: { old: Record<string, unknown> }) => {
          const o = payload.old as { id?: string; message_id?: string }
          if (o.id && o.message_id) mergeDelete(o.id, o.message_id)
          else if (o.id) mergeDeleteByReactionId(o.id)
        },
      )
      .subscribe()

    return () => {
      clearInterval(pollRx)
      sb.removeChannel(channel)
    }
  }, [messages, roomId])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (messageId.startsWith('optimistic-')) return
    const sb = createBrowserClient()
    const list = reactionsByMessageRef.current.get(messageId) || []
    const mine = list.find(r => r.user_id === currentUser.id && r.emoji === emoji)

    async function reloadAllReactions() {
      const slice = messagesRefFromMessages()
      if (slice.length === 0) return
      const { data } = await sb.from('message_reactions').select('id, message_id, user_id, emoji').in('message_id', slice)
      const m = new Map<string, ReactionRow[]>()
      for (const r of data || []) {
        const row = r as ReactionRow
        const arr = m.get(row.message_id) || []
        arr.push(row)
        m.set(row.message_id, arr)
      }
      setReactionsByMessage(m)
    }

    function messagesRefFromMessages() {
      return messages.filter(m => m.message_type !== 'system' && !m.id.startsWith('optimistic-')).map(m => m.id).slice(-80)
    }

    if (mine?.id.startsWith('opt-rx-')) return

    if (mine) {
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        const arr = (next.get(messageId) || []).filter(x => x.id !== mine!.id)
        if (arr.length === 0) next.delete(messageId)
        else next.set(messageId, arr)
        return next
      })
      const { error } = await sb.from('message_reactions').delete().eq('id', mine.id)
      if (error) {
        toast.error(error.message)
        void reloadAllReactions()
      }
      return
    }

    const optimisticId = `opt-rx-${Date.now()}`
    const optimistic: ReactionRow = {
      id: optimisticId,
      message_id: messageId,
      user_id: currentUser.id,
      emoji,
    }
    setReactionsByMessage(prev => {
      const next = new Map(prev)
      const arr = [...(next.get(messageId) || []), optimistic]
      next.set(messageId, arr)
      return next
    })
    const { data, error } = await sb
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: currentUser.id, emoji })
      .select('id, message_id, user_id, emoji')
      .single()
    if (error) {
      toast.error(error.message)
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        const arr = (next.get(messageId) || []).filter(x => x.id !== optimisticId)
        if (arr.length === 0) next.delete(messageId)
        else next.set(messageId, arr)
        return next
      })
      return
    }
    if (data) {
      const row = data as ReactionRow
      setReactionsByMessage(prev => {
        const next = new Map(prev)
        const arr = (next.get(messageId) || []).map(x => (x.id === optimisticId ? row : x))
        next.set(messageId, arr)
        return next
      })
    }
  }, [currentUser.id, messages])

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
    const interval = setInterval(checkPresence, 60000)

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
    if (hashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHashIndex(i => Math.min(i + 1, hashSuggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHashIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertHashTag(hashSuggestions[hashIndex])
        return
      }
      if (e.key === 'Escape') {
        setHashSuggestions([])
        return
      }
    }

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
      setHashSuggestions([])
    } else {
      setMentionQuery(null)
      setMentionSuggestions([])
      const hashMatch = textBeforeCursor.match(/#([^\n#]*)$/)
      if (hashMatch && !isDM && chatLinkTargets.length > 0) {
        const rawQ = hashMatch[1]
        const q = rawQ.toLowerCase()
        const filtered = chatLinkTargets.filter(t => {
          if (!rawQ.trim()) return true
          const l = t.label.toLowerCase()
          const s = t.slug.toLowerCase()
          const qHyphen = q.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          return l.includes(q) || s.includes(q.replace(/\s+/g, '')) || (qHyphen.length > 0 && s.includes(qHyphen))
        }).slice(0, 8)
        setHashSuggestions(filtered)
        setHashIndex(0)
      } else {
        setHashSuggestions([])
      }
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

  function insertHashTag(t: ChatLinkTarget) {
    const textBeforeCursor = input.slice(0, cursorPos)
    const hashStart = textBeforeCursor.lastIndexOf('#')
    if (hashStart === -1) return
    const before = input.slice(0, hashStart)
    const after = input.slice(cursorPos)
    const newInput = `${before}#${t.slug} ${after}`
    setInput(newInput)
    setHashSuggestions([])
    textareaRef.current?.focus()
  }

  // Per reader, show avatar only on their latest-read own message (reduces visual noise; one row per reader in UI)
  const latestReadReadersByMessageId = useMemo(() => {
    const out = new Map<string, ChatMemberProfile[]>()
    const myMsgs = messages.filter(
      m =>
        m.user_id === currentUser.id &&
        m.message_type !== 'system' &&
        !m.id.startsWith('optimistic-'),
    )
    const others = memberProfiles.filter(m => m.id !== currentUser.id)
    for (const member of others) {
      let latest: Message | null = null
      for (const m of myMsgs) {
        const rs = readReceipts.get(m.id) || []
        if (!rs.some(r => r.user_id === member.id)) continue
        if (!latest || new Date(m.created_at) > new Date(latest.created_at)) latest = m
      }
      if (latest) {
        const arr = out.get(latest.id) || []
        arr.push(member)
        arr.sort((a, b) => (a.username || '').localeCompare(b.username || ''))
        out.set(latest.id, arr)
      }
    }
    return out
  }, [messages, readReceipts, memberProfiles, currentUser.id])

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

  function bubbleLongPressHandlers(messageId: string) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return
        if (e.pointerType === 'mouse') return
        longPressTimerRef.current = setTimeout(() => {
          setEmojiPickerForMessageId(messageId)
          longPressTimerRef.current = null
        }, 420)
      },
      onPointerUp: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      },
      onPointerCancel: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      },
      onPointerLeave: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      },
    }
  }

  function onBubbleTouchEnd(messageId: string, e: React.TouchEvent) {
    if (messageId.startsWith('optimistic-')) return
    const now = Date.now()
    const last = lastTapRef.current
    if (last && last.id === messageId && now - last.t < 320) {
      e.preventDefault()
      void toggleReaction(messageId, DOUBLE_TAP_EMOJI)
      lastTapRef.current = null
    } else {
      lastTapRef.current = { id: messageId, t: now }
    }
  }

  function reactionNames(userIds: string[]) {
    return userIds
      .map(uid => {
        const p = memberProfiles.find(m => m.id === uid)
        return p?.full_name || p?.username || 'Member'
      })
      .filter(Boolean)
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
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => (onBack ? onBack() : router.push('/community'))}
            className="text-muted-foreground hover:text-foreground transition-colors md:hidden shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {!isDM && roomImageUrl ? (
            <button
              type="button"
              onClick={() => setRoomImageLightbox(true)}
              className="h-10 w-10 rounded-full overflow-hidden border border-border shrink-0 ring-offset-background hover:ring-2 hover:ring-primary/55 hover:scale-[1.02] active:scale-[0.98] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title="View room image"
            >
              <img src={roomImageUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ) : null}
          <div className="min-w-0">
          {isDM && dmPartner ? (
            <Link href={`/profile/${dmPartner.username}`} className="font-bold hover:text-primary transition-colors">{roomName}</Link>
          ) : (
            <h2 className="font-bold">{roomName}</h2>
          )}
          {isDM ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {dmPartnerOnline ? (
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-green-500 rounded-full inline-block" /> Online</span>
              ) : (
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-zinc-500 rounded-full inline-block" /> Offline</span>
              )}
            </div>
          ) : (
            <button onClick={() => setShowMembers(!showMembers)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {onlineCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  {onlineCount} active
                </span>
              )}
              <span>{memberProfiles.length} members</span>
            </button>
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
                        content: `${currentUser.full_name || currentUser.username} (@${currentUser.username}) left the chat`,
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
                <span className="text-xs truncate flex-1 min-w-0">{m.full_name || m.username}</span>
                {roomType === 'trip' && m.trip_chat_badge ? (
                  <TripStatusBadge phase={m.trip_chat_badge} className="shrink-0" />
                ) : null}
                {m.id === currentUser.id && <span className="text-[10px] text-muted-foreground shrink-0">(you)</span>}
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
                  {roomType === 'trip' && popupMember.trip_chat_badge ? (
                    <div className="mt-1">
                      <TripStatusBadge phase={popupMember.trip_chat_badge} />
                    </div>
                  ) : null}
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
            <div key={msg.id}>
              <MessageBubble
                message={msg}
                isOwn={msg.user_id === currentUser.id}
                isOnline={msg.user_id ? isUserOnline(msg.user_id) : false}
                tripBadge={
                  roomType === 'trip' && msg.user_id
                    ? memberProfiles.find(m => m.id === msg.user_id)?.trip_chat_badge ?? null
                    : null
                }
                onClickProfile={() => msg.user_id && msg.user_id !== currentUser.id && setProfilePopup(msg.user_id)}
                readStatus={msg.user_id === currentUser.id ? getReadStatus(msg.id, currentUser.id) : undefined}
                isDM={isDM}
                readByReaders={!isDM && msg.user_id === currentUser.id ? latestReadReadersByMessageId.get(msg.id) : undefined}
                chatLinkTargets={chatLinkTargets}
                reactionRows={reactionsByMessage.get(msg.id)}
                currentUserId={currentUser.id}
                memberProfiles={memberProfiles}
                onToggleReaction={emoji => { void toggleReaction(msg.id, emoji) }}
                bubbleLongPress={bubbleLongPressHandlers(msg.id)}
                onBubbleTouchEnd={e => onBubbleTouchEnd(msg.id, e)}
                onBubbleDoubleClick={() => {
                  if (!msg.id.startsWith('optimistic-') && msg.message_type !== 'system') {
                    void toggleReaction(msg.id, DOUBLE_TAP_EMOJI)
                  }
                }}
                onShowReactors={(emoji, userIds) => setReactorModal({ emoji, names: reactionNames(userIds) })}
                emojiPickerOpen={emojiPickerForMessageId === msg.id}
                onToggleEmojiPicker={() => setEmojiPickerForMessageId(cur => (cur === msg.id ? null : msg.id))}
                onPickEmojiStrip={emoji => {
                  void toggleReaction(msg.id, emoji)
                  setEmojiPickerForMessageId(null)
                }}
              />
            </div>
          ))}
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

      {hashSuggestions.length > 0 && !isDM && (
        <div className="px-4 pb-1">
          <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            <p className="px-3 py-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide border-b border-border/50">Rooms & trips</p>
            {hashSuggestions.map((t, i) => (
              <button
                key={t.roomId}
                type="button"
                onClick={() => insertHashTag(t)}
                className={`flex flex-col w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === hashIndex ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50'
                }`}
              >
                <span className="font-medium truncate">{t.label}</span>
                <span className="text-[10px] text-muted-foreground font-mono truncate">#{t.slug}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {roomImageLightbox && roomImageUrl ? (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setRoomImageLightbox(false)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-card/90 border border-border text-muted-foreground hover:text-foreground z-[61]"
            onClick={e => {
              e.stopPropagation()
              setRoomImageLightbox(false)
            }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={roomImageUrl}
            alt=""
            className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      ) : null}

      {reactorModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-4"
          onClick={() => setReactorModal(null)}
          role="presentation"
        >
          <div
            className="bg-card rounded-xl p-4 max-w-sm w-full border border-border shadow-xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Who reacted"
          >
            <div className="text-center text-4xl mb-2 select-none">{reactorModal.emoji}</div>
            <p className="text-xs text-muted-foreground mb-2">Reacted by</p>
            <ul className="text-sm space-y-1.5 max-h-52 overflow-y-auto">
              {reactorModal.names.map((n, i) => (
                <li key={`${n}-${i}`} className="font-medium">{n}</li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="mt-4 w-full border-border" onClick={() => setReactorModal(null)}>
              Close
            </Button>
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

type ReactionRowLite = { id: string; user_id: string; emoji: string }

function ReactionPill({
  emoji,
  count,
  userIds,
  title,
  iReacted,
  onTap,
  onLongShow,
}: {
  emoji: string
  count: number
  userIds: string[]
  title: string
  iReacted: boolean
  onTap: () => void
  onLongShow: () => void
}) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
        iReacted
          ? 'bg-primary/25 border-primary/50 text-foreground'
          : 'bg-secondary/80 border-border text-muted-foreground hover:border-primary/40'
      }`}
      onClick={e => {
        e.stopPropagation()
        onTap()
      }}
      title={title}
      onPointerDown={e => {
        if (e.pointerType === 'touch') {
          holdRef.current = setTimeout(() => {
            holdRef.current = null
            onLongShow()
          }, 500)
        }
      }}
      onPointerUp={() => {
        if (holdRef.current) {
          clearTimeout(holdRef.current)
          holdRef.current = null
        }
      }}
      onPointerCancel={() => {
        if (holdRef.current) {
          clearTimeout(holdRef.current)
          holdRef.current = null
        }
      }}
    >
      <span className="leading-none text-base">{emoji}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  )
}

function MessageBubble({
  message,
  isOwn,
  isOnline,
  onClickProfile: _onClickProfile,
  readStatus,
  isDM,
  readByReaders,
  chatLinkTargets = [],
  reactionRows,
  currentUserId,
  memberProfiles,
  onToggleReaction,
  bubbleLongPress,
  onBubbleTouchEnd,
  onBubbleDoubleClick,
  onShowReactors,
  emojiPickerOpen,
  onToggleEmojiPicker,
  onPickEmojiStrip,
  tripBadge,
}: {
  message: Message
  isOwn: boolean
  isOnline: boolean
  onClickProfile: () => void
  readStatus?: 'sending' | 'sent' | 'read'
  isDM?: boolean
  readByReaders?: ChatMemberProfile[]
  chatLinkTargets?: ChatLinkTarget[]
  reactionRows?: ReactionRowLite[]
  currentUserId: string
  memberProfiles: ChatMemberProfile[]
  onToggleReaction: (emoji: string) => void
  bubbleLongPress: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerCancel: () => void
    onPointerLeave: () => void
  }
  onBubbleTouchEnd: (e: React.TouchEvent) => void
  onBubbleDoubleClick: () => void
  onShowReactors: (emoji: string, userIds: string[]) => void
  emojiPickerOpen: boolean
  onToggleEmojiPicker: () => void
  onPickEmojiStrip: (emoji: string) => void
  tripBadge?: TripChatBookingPhase | null
}): React.ReactNode {
  const user = message.user
  const name = user?.full_name || user?.username || 'Unknown'
  const profileUrl = user?.username ? `/profile/${user.username}` : '#'

  const reactionAgg = useMemo(() => {
    if (!reactionRows?.length) return []
    const m = new Map<string, string[]>()
    for (const r of reactionRows) {
      const arr = m.get(r.emoji) || []
      arr.push(r.user_id)
      m.set(r.emoji, arr)
    }
    return [...m.entries()]
      .map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
        iReacted: userIds.includes(currentUserId),
      }))
      .sort((a, b) => b.count - a.count)
  }, [reactionRows, currentUserId])

  const canReact = message.message_type !== 'system' && !message.id.startsWith('optimistic-')

  if (message.message_type === 'system') {
    // Make usernames in system messages clickable
    // Pattern: "🎉 Username (@handle) has joined" or "Username left the chat"
    const joinMatch = message.content.match(/^[🎉\s]*(.+?) \(@(\w+)\) has joined/)
    const leftMatch = message.content.match(/^(.+?) \(@(\w+)\) left the chat$/)

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
            <Link href={`/profile/${leftMatch[2]}`} className="text-primary hover:underline font-medium">{leftMatch[1]}</Link> left the chat
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

  function renderWithMentions(content: string, ownMsg: boolean) {
    return renderMessageContent(content, ownMsg, chatLinkTargets)
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
          <div className="flex items-center gap-1.5 flex-wrap max-w-full">
            <Link href={profileUrl} className="text-xs text-muted-foreground font-medium hover:text-primary transition-colors flex items-center gap-1 min-w-0">
              <span className="truncate">{name}</span>
              {isOnline && <span className="h-1.5 w-1.5 bg-green-500 rounded-full inline-block shrink-0" />}
            </Link>
            {tripBadge ? <TripStatusBadge phase={tripBadge} /> : null}
          </div>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words touch-manipulation ${
            isOwn
              ? 'bg-primary text-black rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm'
          }`}
          {...(canReact ? bubbleLongPress : {})}
          onTouchEnd={canReact ? onBubbleTouchEnd : undefined}
          onDoubleClick={canReact ? onBubbleDoubleClick : undefined}
        >
          {renderWithMentions(message.content, isOwn)}
        </div>
        {canReact && (
          <div
            data-emoji-strip-root={message.id}
            className={`flex items-start gap-1.5 mt-0.5 max-w-[92vw] ${
              isOwn ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div className={`flex flex-wrap gap-1.5 min-w-0 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {reactionAgg.map(block => {
                const names = block.userIds
                  .map(uid => memberProfiles.find(m => m.id === uid))
                  .filter(Boolean)
                  .map(p => p!.full_name || p!.username)
                const tip = names.length ? names.join(', ') : 'React'
                return (
                  <ReactionPill
                    key={block.emoji}
                    emoji={block.emoji}
                    count={block.count}
                    userIds={block.userIds}
                    title={tip}
                    iReacted={block.iReacted}
                    onTap={() => onToggleReaction(block.emoji)}
                    onLongShow={() => onShowReactors(block.emoji, block.userIds)}
                  />
                )
              })}
            </div>
            <div
              className={`flex shrink-0 items-stretch rounded-lg border border-border/70 bg-card/95 shadow-sm transition-[box-shadow] duration-200 ${
                emojiPickerOpen ? 'shadow-md ring-1 ring-primary/25 overflow-visible' : 'overflow-hidden'
              } ${isOwn ? 'flex-row' : 'flex-row-reverse'}`}
            >
              <button
                type="button"
                className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0"
                title={emojiPickerOpen ? 'Close reactions' : 'Add reaction'}
                onClick={e => {
                  e.stopPropagation()
                  onToggleEmojiPicker()
                }}
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </button>
              <div
                className={`transition-[max-width,opacity] duration-300 ease-out border-l border-border/50 overflow-x-auto overflow-y-visible ${
                  emojiPickerOpen ? 'max-w-[min(24rem,calc(100vw-4rem))] opacity-100' : 'max-w-0 opacity-0 pointer-events-none overflow-hidden'
                }`}
              >
                <div className="flex flex-nowrap items-center gap-0.5 pl-1 pr-2 py-0.5 min-h-7">
                  {CHAT_QUICK_REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="text-[15px] leading-none min-w-[28px] h-7 px-0.5 rounded-md flex items-center justify-center shrink-0 transition-all duration-150 ease-out hover:scale-110 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 dark:focus-visible:ring-primary/80 hover:drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] active:scale-95"
                      onClick={e => {
                        e.stopPropagation()
                        onPickEmojiStrip(emoji)
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className={`flex items-center gap-1 flex-wrap ${isOwn ? 'justify-end' : ''}`}>
          {isOwn && tripBadge ? <TripStatusBadge phase={tripBadge} /> : null}
          <span className="text-[10px] text-muted-foreground">{timeAgo(message.created_at)}</span>
          {isOwn && readStatus && readStatus !== 'sending' && (
            <span className="flex items-center shrink-0">
              {readStatus === 'read' ? (
                <CheckCheck className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Check className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          )}
          {isOwn && !isDM && readByReaders && readByReaders.length > 0 && (
            <span className="flex items-center flex-row shrink-0" title={readByReaders.map(r => r.full_name || r.username).join(', ')}>
              {readByReaders.slice(0, 4).map((r, i) => (
                <Link
                  key={r.id}
                  href={`/profile/${r.username}`}
                  className={`relative rounded-full ring-2 ring-background ${i > 0 ? '-ml-2' : ''}`}
                  style={{ zIndex: 11 + i }}
                  onClick={e => e.stopPropagation()}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={r.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/30 text-primary text-[7px] font-bold">{getInitials(r.full_name || r.username)}</AvatarFallback>
                  </Avatar>
                </Link>
              ))}
              {readByReaders.length > 4 && (
                <span
                  className="h-5 min-w-[20px] px-1 rounded-full bg-secondary border border-border text-[9px] font-bold flex items-center justify-center -ml-2 ring-2 ring-background"
                  style={{ zIndex: 20 }}
                >
                  +{readByReaders.length - 4}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
