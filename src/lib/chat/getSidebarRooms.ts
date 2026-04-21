import type { SupabaseClient } from '@supabase/supabase-js'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'

/**
 * Fetch all sidebar rooms for a user — optimized with batch queries.
 */
export async function getSidebarRooms(supabase: SupabaseClient, userId: string): Promise<SidebarRoom[]> {
  // Parallel: get member rooms + general rooms
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

  // Collect room IDs
  for (const room of userRooms) {
    const id = String(room['id'])
    allRoomIds.push(id)
    if (String(room['type']) === 'direct') dmRoomIds.push(id)
  }

  // Add general rooms not yet in member list
  const memberRoomIdSet = new Set(allRoomIds)
  const extraGeneralRooms = (generalRooms || []).filter(r => !memberRoomIdSet.has(r.id))
  for (const r of extraGeneralRooms) allRoomIds.push(r.id)

  // Batch: get last message for ALL rooms in one query per room (use RPC or individual but parallel)
  // Since Supabase doesn't support "distinct on" easily, fetch last messages in parallel
  const msgPromises = allRoomIds.map(id =>
    supabase.from('messages').select('content, created_at, user_id').eq('room_id', id).order('created_at', { ascending: false }).limit(1)
  )

  // Batch: get DM partners - all members of DM rooms excluding current user
  const dmMembersPromise = dmRoomIds.length > 0
    ? supabase.from('chat_room_members').select('room_id, user_id').in('room_id', dmRoomIds).neq('user_id', userId)
    : Promise.resolve({ data: [] as { room_id: string; user_id: string }[] })

  // Execute all in parallel
  const [msgResults, { data: dmMembers }] = await Promise.all([
    Promise.all(msgPromises),
    dmMembersPromise,
  ])

  // Build message map
  const msgMap = new Map<string, { content: string; created_at: string; user_id?: string }>()
  allRoomIds.forEach((id, i) => {
    const msgs = msgResults[i]?.data
    if (msgs?.[0]) msgMap.set(id, msgs[0])
  })

  // Get DM partner profiles in one batch
  const dmPartnerIds = [...new Set((dmMembers || []).map(m => m.user_id))]
  let profileMap = new Map<string, { id: string; username: string; full_name: string | null; avatar_url: string | null }>()
  const dmPartnerHasStatus = new Set<string>()
  const dmPartnerStatusSeen = new Set<string>() // true = current user has seen ALL their active stories
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

    // Group active stories by author
    const storiesByAuthor = new Map<string, string[]>()
    for (const s of activeStories) {
      dmPartnerHasStatus.add(s.author_id)
      const list = storiesByAuthor.get(s.author_id) || []
      list.push(s.id)
      storiesByAuthor.set(s.author_id, list)
    }

    // Check which stories the current user has already viewed
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

  // Build DM room → partner map
  const dmPartnerMap = new Map<string, string>()
  for (const m of dmMembers || []) {
    dmPartnerMap.set(m.room_id, m.user_id)
  }

  // Build rooms
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

    const msg = msgMap.get(id)
    rooms.push({
      id,
      name,
      type,
      lastMessage: msg?.content,
      lastMessageAt: msg?.created_at,
      dmProfile,
      dmHasActiveStatus,
      dmStatusSeen,
      tripImage,
      tripLocation,
      communityImage,
      isMember: true,
    })
  }

  // Add general rooms user hasn't joined
  for (const room of extraGeneralRooms) {
    const msg = msgMap.get(room.id)
    rooms.push({
      id: room.id,
      name: room.name,
      type: 'general',
      lastMessage: msg?.content,
      lastMessageAt: msg?.created_at,
      communityImage: room.image_url || undefined,
      isMember: false,
    })
  }

  // Sort by recent message
  rooms.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))

  return rooms
}
