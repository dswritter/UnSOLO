import { createClient } from '@/lib/supabase/server'
import { TribeRoomApplyHydration } from '@/components/chat/TribeRoomCoordinator'
import type { ChatMemberProfile } from '@/components/chat/ChatWindow'
import { hashtagSlugFromRoomName } from '@/lib/chat/chatHashTags'
import { bestTripChatPhaseForUser, type TripChatBookingPhase } from '@/lib/chat/tripChatAccess'
import type { Message } from '@/types'

type TripPkgCal = {
  duration_days: number
  departure_dates: string[] | null | undefined
  return_dates: string[] | null | undefined
}

type Props = {
  roomId: string
  userId: string
  pinId: string | null
  roomType: string
  packageId: string | null
  tripPkgCal: TripPkgCal
}

export async function TribeRoomHydrationLoader({
  roomId,
  userId,
  pinId,
  roomType,
  packageId,
  tripPkgCal,
}: Props) {
  const supabase = await createClient()

  const [{ data: members }, { data: linkRooms }, { data: pinnedMsg }] = await Promise.all([
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId),
    supabase
      .from('chat_rooms')
      .select('id, name, type, package:packages(slug)')
      .eq('is_active', true)
      .in('type', ['general', 'trip']),
    pinId
      ? supabase
          .from('messages')
          .select('*, user:profiles(id, username, full_name, avatar_url)')
          .eq('id', pinId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean) as string[]
  let memberProfiles: ChatMemberProfile[] = []
  if (memberIds.length > 0) {
    const [{ data: profiles }, { data: phoneRequests }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, phone_number, phone_public, role')
        .in('id', memberIds),
      supabase.from('phone_requests').select('target_id, status').eq('requester_id', userId).in('target_id', memberIds),
    ])
    let memberBookings: { user_id: string; status: string; travel_date: string }[] = []
    if (roomType === 'trip' && packageId) {
      const { data: mb } = await supabase
        .from('bookings')
        .select('user_id, status, travel_date')
        .eq('package_id', packageId)
        .in('user_id', memberIds)
      memberBookings = mb || []
    }
    const requestMap = new Map((phoneRequests || []).map(r => [r.target_id, r.status]))
    const byUserBookings = new Map<string, { status: string; travel_date: string }[]>()
    for (const row of memberBookings) {
      const arr = byUserBookings.get(row.user_id) || []
      arr.push({ status: row.status, travel_date: row.travel_date })
      byUserBookings.set(row.user_id, arr)
    }
    memberProfiles = (profiles || []).map(p => {
      const rows = byUserBookings.get(p.id) || []
      const trip_chat_badge: TripChatBookingPhase | null | undefined =
        roomType === 'trip' && packageId ? bestTripChatPhaseForUser(rows, tripPkgCal) : undefined
      return { ...p, phone_request_status: requestMap.get(p.id) || null, trip_chat_badge } as ChatMemberProfile
    })
  }

  const chatLinkTargets: { roomId: string; slug: string; label: string }[] = []
  const seenSlugs = new Set<string>()
  for (const r of linkRooms || []) {
    const row = r as unknown as {
      id: string
      name: string
      type: string
      package: { slug: string } | { slug: string }[] | null
    }
    const pkgSlug =
      row.package && !Array.isArray(row.package)
        ? row.package.slug
        : Array.isArray(row.package)
          ? row.package[0]?.slug
          : undefined
    if (row.type === 'general' && row.name) {
      const slug = hashtagSlugFromRoomName(row.name)
      if (slug && !seenSlugs.has(slug)) {
        seenSlugs.add(slug)
        chatLinkTargets.push({ roomId: row.id, slug, label: row.name })
      }
    } else if (row.type === 'trip' && pkgSlug && !seenSlugs.has(pkgSlug)) {
      seenSlugs.add(pkgSlug)
      chatLinkTargets.push({
        roomId: row.id,
        slug: pkgSlug,
        label: pkgSlug.replace(/-/g, ' '),
      })
    }
  }

  return (
    <TribeRoomApplyHydration
      payload={{
        memberProfiles,
        chatLinkTargets,
        pinnedMessage: (pinnedMsg as Message | null) ?? null,
        initialPollsByMessageId: {},
      }}
    />
  )
}
