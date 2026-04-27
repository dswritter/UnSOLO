import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_PAGE = { limit: 8, offset: 0 }

type LastRow = {
  room_id: string
  last_content: string
  last_at: string
  last_message_type: string
  last_user_id: string | null
}

function previewFromLastMessage(msg: { content: string; message_type: string } | undefined): string | undefined {
  if (!msg) return undefined
  if (msg.message_type === 'poll') return `📊 ${msg.content}`.length > 120 ? `📊 ${msg.content.slice(0, 117)}…` : `📊 ${msg.content}`
  return msg.content
}

/**
 * Fetch sidebar rooms for Tribe — one RPC for last message per room, then paginate the sorted list.
 */
export type SidebarRoomPageResult = {
  rooms: SidebarRoom[]
  total: number
  roomNameIndex: { id: string; name: string }[]
  /** Room ids pinned by this user (most recently pinned first). */
  pinnedRoomIds: string[]
}

export async function getSidebarRooms(
  supabase: SupabaseClient,
  userId: string,
  pagination: { limit: number; offset: number } = DEFAULT_PAGE,
): Promise<SidebarRoomPageResult> {
  const [{ data: memberRooms }, { data: generalRooms }] = await Promise.all([
    supabase
      .from('chat_room_members')
      .select('room:chat_rooms(id, name, type, is_active, package_id, image_url, package:packages(title, images, destination:destinations(name, state)))')
      .eq('user_id', userId),
    supabase
      .from('chat_rooms')
      .select('id, name, type, is_active, image_url')
      .eq('type', 'general')
      .eq('is_active', true),
  ])

  const userRooms = (memberRooms || [])
    .map(m => m.room as unknown as Record<string, unknown>)
    .filter(Boolean)
    .filter(room => {
      if (String(room['type']) === 'general' && room['is_active'] === false) return false
      return true
    })
  const allRoomIds: string[] = []
  const dmRoomIds: string[] = []

  for (const room of userRooms) {
    const id = String(room['id'])
    allRoomIds.push(id)
    if (String(room['type']) === 'direct') dmRoomIds.push(id)
  }

  const memberRoomIdSet = new Set(allRoomIds)
  const extraGeneralRooms = (generalRooms || []).filter(r => !memberRoomIdSet.has(r.id))
  for (const r of extraGeneralRooms) allRoomIds.push(r.id)

  const msgMap = new Map<string, { content: string; created_at: string; message_type: string; user_id?: string }>()

  if (allRoomIds.length > 0) {
    const { data: lastRows, error: rpcError } = await supabase.rpc('last_message_preview_for_rooms', {
      p_room_ids: allRoomIds,
    })
    if (rpcError) {
      console.error('last_message_preview_for_rooms', rpcError)
      const msgPromises = allRoomIds.map(id =>
        supabase.from('messages').select('content, created_at, user_id, message_type').eq('room_id', id).order('created_at', { ascending: false }).limit(1),
      )
      const msgResults = await Promise.all(msgPromises)
      allRoomIds.forEach((id, i) => {
        const row = msgResults[i]?.data?.[0] as
          | { content: string; created_at: string; user_id?: string; message_type?: string }
          | undefined
        if (row) {
          msgMap.set(id, {
            content: row.content,
            created_at: row.created_at,
            message_type: row.message_type || 'text',
            user_id: row.user_id,
          })
        }
      })
    } else {
      for (const raw of (lastRows || []) as LastRow[]) {
        msgMap.set(raw.room_id, {
          content: raw.last_content,
          created_at: raw.last_at,
          message_type: raw.last_message_type,
          user_id: raw.last_user_id || undefined,
        })
      }
    }
  }

  const dmMembersPromise = dmRoomIds.length > 0
    ? supabase.from('chat_room_members').select('room_id, user_id').in('room_id', dmRoomIds).neq('user_id', userId)
    : Promise.resolve({ data: [] as { room_id: string; user_id: string }[] })

  const { data: dmMembers } = await dmMembersPromise

  const dmPartnerIds = [...new Set((dmMembers || []).map(m => m.user_id))]
  let profileMap = new Map<string, { id: string; username: string; full_name: string | null; avatar_url: string | null }>()
  const dmPartnerHasStatus = new Set<string>()
  const dmPartnerStatusSeen = new Set<string>()
  if (dmPartnerIds.length > 0) {
    const now = new Date().toISOString()
    const [{ data: profiles }, { data: statusRows }] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', dmPartnerIds),
      supabase
        .from('status_stories')
        .select('id, author_id')
        .in('author_id', dmPartnerIds)
        .gt('expires_at', now),
    ])
    for (const p of profiles || []) profileMap.set(p.id, p)

    const activeStories = statusRows || []
    const activeStoryIds = activeStories.map(s => s.id)
    const storiesByAuthor = new Map<string, string[]>()
    for (const s of activeStories) {
      dmPartnerHasStatus.add(s.author_id)
      const list = storiesByAuthor.get(s.author_id) || []
      list.push(s.id)
      storiesByAuthor.set(s.author_id, list)
    }

    if (activeStoryIds.length > 0) {
      const { data: views } = await supabase
        .from('status_story_views')
        .select('story_id')
        .eq('viewer_id', userId)
        .in('story_id', activeStoryIds)
      const viewedIds = new Set((views || []).map(v => v.story_id))
      for (const [authorId, ids] of storiesByAuthor) {
        if (ids.every(id => viewedIds.has(id))) dmPartnerStatusSeen.add(authorId)
      }
    }
  }

  const dmPartnerMap = new Map<string, string>()
  for (const m of dmMembers || []) {
    dmPartnerMap.set(m.room_id, m.user_id)
  }

  const rooms: SidebarRoom[] = []

  for (const room of userRooms) {
    const id = String(room['id'])
    const type = String(room['type']) as 'trip' | 'direct' | 'general'
    let name = String(room['name'] || 'Chat')
    let dmProfile: SidebarRoom['dmProfile'] = undefined
    let tripImage: string | undefined
    let tripLocation: string | undefined
    let communityImage: string | undefined
    let dmPartnerId: string | undefined

    if (type === 'general') {
      const img = room['image_url']
      if (img && typeof img === 'string') communityImage = img
    }

    if (type === 'direct') {
      dmPartnerId = dmPartnerMap.get(id)
      if (dmPartnerId) {
        const p = profileMap.get(dmPartnerId)
        if (p) {
          dmProfile = p
          name = p.full_name || p.username
        }
      }
    }

    const dmHasActiveStatus = type === 'direct' && dmPartnerId ? dmPartnerHasStatus.has(dmPartnerId) : false
    const dmStatusSeen = type === 'direct' && dmPartnerId ? dmPartnerStatusSeen.has(dmPartnerId) : false

    if (type === 'trip') {
      const pkg = room['package'] as { title?: string; images?: string[]; destination?: { name?: string; state?: string } } | null
      if (pkg?.images?.[0]) tripImage = pkg.images[0]
      if (pkg?.destination) tripLocation = `${pkg.destination.name}, ${pkg.destination.state}`
    }

    const raw = msgMap.get(id)
    const lastPreview = previewFromLastMessage(raw)
    rooms.push({
      id,
      name,
      type,
      lastMessage: lastPreview,
      lastMessageAt: raw?.created_at,
      dmProfile,
      dmHasActiveStatus,
      dmStatusSeen,
      tripImage,
      tripLocation,
      communityImage,
      isMember: true,
    })
  }

  for (const room of extraGeneralRooms) {
    const raw = msgMap.get(room.id)
    const lastPreview = previewFromLastMessage(raw)
    rooms.push({
      id: room.id,
      name: room.name,
      type: 'general',
      lastMessage: lastPreview,
      lastMessageAt: raw?.created_at,
      communityImage: room.image_url || undefined,
      isMember: false,
    })
  }

  const { data: pinRows } = await supabase
    .from('chat_sidebar_room_pins')
    .select('room_id, pinned_at')
    .eq('user_id', userId)
    .order('pinned_at', { ascending: false })

  const pinOrder = new Map<string, number>()
  let pinIdx = 0
  for (const raw of pinRows || []) {
    pinOrder.set(String((raw as { room_id: string }).room_id), pinIdx++)
  }

  const roomIdSet = new Set(rooms.map(r => r.id))
  const pinnedRoomIds = (pinRows || [])
    .map(r => String((r as { room_id: string }).room_id))
    .filter(id => roomIdSet.has(id))

  rooms.sort((a, b) => {
    const pa = pinOrder.has(a.id) ? pinOrder.get(a.id)! : 1_000_000
    const pb = pinOrder.has(b.id) ? pinOrder.get(b.id)! : 1_000_000
    if (pa !== pb) return pa - pb
    return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')
  })

  const total = rooms.length
  const { limit, offset } = pagination
  const paged = rooms.slice(offset, offset + limit)
  const roomNameIndex = rooms.map(r => ({ id: r.id, name: r.name }))

  return { rooms: paged, total, roomNameIndex, pinnedRoomIds }
}

/**
 * Dedupes sidebar fetches within a single RSC request (layout + page both need the same list).
 */
export const getCachedSidebarRooms = cache(
  async (
    userId: string,
    pagination: { limit: number; offset: number } = { limit: 8, offset: 0 },
  ): Promise<SidebarRoomPageResult> => {
    const supabase = await createClient()
    return getSidebarRooms(supabase, userId, pagination)
  },
)
