export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatWindow, type ChatMemberProfile } from '@/components/chat/ChatWindow'
import { JoinRoomButton } from '@/components/chat/JoinRoomButton'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { Message, Profile } from '@/types'
import { hashtagSlugFromRoomName } from '@/lib/chat/chatHashTags'
import {
  bestTripChatPhaseForUser,
  userHasTripChatAccess,
  type TripChatBookingPhase,
} from '@/lib/chat/tripChatAccess'

type PackageJoin = {
  title?: string
  slug?: string
  duration_days?: number | null
  images?: string[] | null
  destination?: { name: string; state: string } | { name: string; state: string }[] | null
} | null

function unwrapPackage(p: PackageJoin | PackageJoin[]): PackageJoin {
  if (!p) return null
  return Array.isArray(p) ? p[0] ?? null : p
}

export default async function CommunityRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: room } = await supabase
    .from('chat_rooms')
    .select('*, package:packages(title, slug, duration_days, images, destination:destinations(name, state))')
    .eq('id', roomId)
    .eq('is_active', true)
    .single()

  if (!room) notFound()

  const pkg = unwrapPackage(room.package as PackageJoin | PackageJoin[])
  const tripDurationDays = Math.max(1, Number(pkg?.duration_days) || 3)
  const packageSlug = pkg?.slug || ''

  const { data: membership } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  let effectiveMembership = membership

  let userTripBookings: { status: string; travel_date: string }[] = []
  if (room.type === 'trip' && room.package_id) {
    const { data: ub } = await supabase
      .from('bookings')
      .select('status, travel_date')
      .eq('user_id', user.id)
      .eq('package_id', room.package_id)
    userTripBookings = ub || []
  }

  const tripEligible =
    room.type !== 'trip' || !room.package_id || userHasTripChatAccess(userTripBookings, tripDurationDays)

  if (room.type === 'trip' && room.package_id && effectiveMembership && !tripEligible) {
    await supabase.from('chat_room_members').delete().eq('room_id', roomId).eq('user_id', user.id)
    effectiveMembership = null
  }

  if (!effectiveMembership && room.type === 'direct') {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Private Conversation</h2>
          <p className="text-muted-foreground text-sm">You don&apos;t have access to this chat.</p>
          <Button asChild className="bg-primary text-black"><Link href="/community">Back</Link></Button>
        </div>
      </div>
    )
  }

  if (!effectiveMembership && room.type !== 'general' && room.type !== 'direct') {
    if (tripEligible) {
      return (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4">
            <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
            <h2 className="text-xl font-bold">You left this chat</h2>
            <p className="text-muted-foreground text-sm">Rejoin to see new messages and participate.</p>
            <JoinRoomButton roomId={roomId} label="Rejoin Chat" />
          </div>
        </div>
      )
    }

    const bookHref = packageSlug ? `/packages/${packageSlug}` : '/explore'
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip-only Chat</h2>
          <p className="text-muted-foreground text-sm">
            This chat is for travelers with an active, upcoming, ongoing, or completed booking for this trip.
          </p>
          <Button asChild className="bg-primary text-black">
            <Link href={bookHref}>{packageSlug ? 'Book this trip' : 'Browse trips'}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!effectiveMembership && room.type === 'general') {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">{room.name}</h2>
          <p className="text-muted-foreground text-sm">Join this community to see chats and participate.</p>
          <JoinRoomButton roomId={roomId} label="Join Community" />
        </div>
      </div>
    )
  }

  const [{ data: msgs }, { data: profile }, { data: members }, { data: linkRooms }] = await Promise.all([
    supabase.from('messages').select('*, user:profiles(id, username, full_name, avatar_url)').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId),
    supabase
      .from('chat_rooms')
      .select('id, name, type, package:packages(slug)')
      .eq('is_active', true)
      .in('type', ['general', 'trip']),
  ])

  if (!profile) redirect('/login')

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean)
  let memberProfiles: ChatMemberProfile[] = []
  if (memberIds.length > 0) {
    const [{ data: profiles }, { data: phoneRequests }] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_url, bio, phone_number, phone_public').in('id', memberIds),
      supabase.from('phone_requests').select('target_id, status').eq('requester_id', user.id).in('target_id', memberIds),
    ])
    let memberBookings: { user_id: string; status: string; travel_date: string }[] = []
    if (room.type === 'trip' && room.package_id) {
      const { data: mb } = await supabase
        .from('bookings')
        .select('user_id, status, travel_date')
        .eq('package_id', room.package_id)
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
        room.type === 'trip' && room.package_id
          ? bestTripChatPhaseForUser(rows, tripDurationDays)
          : undefined
      return { ...p, phone_request_status: requestMap.get(p.id) || null, trip_chat_badge } as ChatMemberProfile
    })
  }

  let displayName = room.name
  if (room.type === 'direct') {
    const other = memberProfiles.find(m => m.id !== user.id)
    if (other) displayName = other.full_name || other.username
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
      row.package && !Array.isArray(row.package) ? row.package.slug : Array.isArray(row.package) ? row.package[0]?.slug : undefined
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

  const rowImage = (room as { image_url?: string | null }).image_url
  const roomImageUrl =
    (typeof rowImage === 'string' && rowImage.trim() !== '' ? rowImage : null) ||
    (room.type === 'trip' && pkg?.images?.[0] ? pkg.images[0] : null)

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <ChatWindow
        roomId={roomId}
        roomName={displayName}
        roomType={room.type as 'trip' | 'general' | 'direct'}
        roomImageUrl={roomImageUrl}
        initialMessages={((msgs || []) as Message[]).reverse()}
        currentUser={profile as Profile}
        memberProfiles={memberProfiles}
        chatLinkTargets={chatLinkTargets}
      />
    </div>
  )
}
