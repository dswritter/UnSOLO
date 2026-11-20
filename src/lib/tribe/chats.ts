import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_LITE, mediaFromUrl, toUserLite, type Media, type UserLite } from './models'

type Row = Record<string, unknown>

export type ChatSummary = {
  id: string
  type: 'trip' | 'direct' | 'general'
  name: string
  image: Media | null
  lastMessage: { body: string; at: string; authorName: string } | null
  unread: number
  isRequest: boolean
}
export type ChatMessage = {
  id: string
  clientId: string | null
  author: UserLite
  body: string
  type: 'text' | 'image' | 'system'
  createdAt: string
  editedAt: string | null
}

export const MESSAGE_SELECT = `id, client_id, content, message_type, created_at, is_edited, user_id,
  author:profiles!messages_user_id_fkey(${PROFILE_LITE})`

export function toMessage(r: Row): ChatMessage {
  return {
    id: String(r.id),
    clientId: (r.client_id as string | null) ?? null,
    author: toUserLite(r.author as Row),
    body: String(r.content ?? ''),
    type: (r.message_type as ChatMessage['type']) ?? 'text',
    createdAt: String(r.created_at),
    editedAt: r.is_edited ? String(r.created_at) : null,
  }
}

/** Rooms the user is a member of, newest activity first, with unread counts (since last_read). */
export async function listChats(db: SupabaseClient, userId: string, type?: string, limit = 30, offset = 0): Promise<{ items: ChatSummary[]; hasMore: boolean }> {
  const { data: memberships, error } = await db
    .from('chat_room_members')
    .select('last_read, room:chat_rooms(id, name, type, is_active, image_url, package:packages(images))')
    .eq('user_id', userId)
  if (error) throw error
  const rooms = ((memberships ?? []) as Row[])
    .map((m) => ({ lastRead: String(m.last_read ?? '1970-01-01'), room: m.room as Row | null }))
    .filter((m) => m.room && m.room.is_active !== false && (!type || m.room.type === type))
  if (rooms.length === 0) return { items: [], hasMore: false }
  const ids = rooms.map((m) => String(m.room!.id))

  const { data: previews } = await db.rpc('last_message_preview_for_rooms', { p_room_ids: ids })
  const last = new Map<string, Row>()
  for (const p of (previews ?? []) as Row[]) last.set(String(p.room_id), p)

  // DMs: name/avatar of the other member, and whether it's a "request" (you don't follow them).
  const dmIds = rooms.filter((m) => m.room!.type === 'direct').map((m) => String(m.room!.id))
  const others = new Map<string, Row>()
  if (dmIds.length) {
    const { data } = await db.from('chat_room_members').select(`room_id, user_id, profile:profiles!chat_room_members_user_id_fkey(${PROFILE_LITE})`)
      .in('room_id', dmIds).neq('user_id', userId)
    for (const r of (data ?? []) as Row[]) others.set(String(r.room_id), r)
  }
  const otherIds = [...others.values()].map((r) => String(r.user_id))
  const following = new Set<string>()
  if (otherIds.length) {
    const { data } = await db.from('follows').select('following_id').eq('follower_id', userId).in('following_id', otherIds)
    for (const r of (data ?? []) as Row[]) following.add(String(r.following_id))
  }

  const items: ChatSummary[] = await Promise.all(rooms.map(async ({ room, lastRead }) => {
    const id = String(room!.id)
    const t = room!.type as ChatSummary['type']
    const lm = last.get(id)
    const other = others.get(id)
    const { count } = await db.from('messages').select('id', { count: 'exact', head: true })
      .eq('room_id', id).neq('user_id', userId).gt('created_at', lastRead)
    const pkg = room!.package as Row | null
    const otherProfile = other ? toUserLite(other.profile as Row) : null
    return {
      id,
      type: t,
      name: t === 'direct' ? otherProfile?.name ?? 'Direct message' : String(room!.name),
      image: t === 'direct' ? mediaFromUrl(otherProfile?.avatarUrl) : mediaFromUrl((room!.image_url as string | null) ?? (Array.isArray(pkg?.images) ? (pkg!.images as string[])[0] : null)),
      lastMessage: lm ? { body: lm.last_message_type === 'image' ? 'Photo' : String(lm.last_content ?? ''), at: String(lm.last_at), authorName: lm.last_user_id === userId ? 'You' : '' } : null,
      unread: count ?? 0,
      isRequest: t === 'direct' && !!other && !following.has(String(other.user_id)),
    }
  }))
  items.sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''))
  return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit }
}

export async function countUnreadMessages(db: SupabaseClient, userId: string): Promise<number> {
  try {
    const { items } = await listChats(db, userId, undefined, 200)
    return items.filter((c) => c.type !== 'general').reduce((n, c) => n + c.unread, 0)
  } catch {
    return 0
  }
}
