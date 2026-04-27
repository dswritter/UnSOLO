export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import type { ChatMemberProfile } from '@/components/chat/ChatWindow'
import { TribeRoomCoordinator } from '@/components/chat/TribeRoomCoordinator'
import { TribeRoomHydrationLoader } from '@/components/chat/TribeRoomHydrationLoader'
import { JoinRoomButton } from '@/components/chat/JoinRoomButton'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { Profile } from '@/types'
import { userHasTripChatAccess } from '@/lib/chat/tripChatAccess'
import { getMessagingBasePath } from '@/lib/routing/messagingBasePath'

type PackageJoin = {
  title?: string
  slug?: string
  duration_days?: number | null
  departure_dates?: string[] | null
  return_dates?: string[] | null
  images?: string[] | null
  destination?: { name: string; state: string } | { name: string; state: string }[] | null
} | null

function unwrapPackage(p: PackageJoin | PackageJoin[]): PackageJoin {
  if (!p) return null
  return Array.isArray(p) ? p[0] ?? null : p
}

export default async function TribeRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  const listPath = await getMessagingBasePath()
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: room } = await supabase
    .from('chat_rooms')
    .select('*, package:packages(title, slug, duration_days, departure_dates, return_dates, images, destination:destinations(name, state))')
    .eq('id', roomId)
    .maybeSingle()

  const roomRow = room as { pinned_message_id?: string | null; package_id?: string | null } | null
  const pinId = roomRow?.pinned_message_id ?? null

  if (!room) notFound()

  if (!room.is_active && room.type === 'trip') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-white/90">
        <div className="text-center space-y-4 max-w-md">
          <MessageCircle className="h-12 w-12 text-[#fcba03]/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip chat</h2>
          <p className="text-white/60 text-sm">Currently this trip is not live.</p>
          <Button asChild className="bg-[#fcba03] text-black font-bold">
            <Link href="/explore">Browse trips</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!room.is_active) {
    notFound()
  }

  const pkg = unwrapPackage(room.package as PackageJoin | PackageJoin[])
  const tripPkgCal = {
    duration_days: Math.max(1, Number(pkg?.duration_days) || 3),
    departure_dates: pkg?.departure_dates,
    return_dates: pkg?.return_dates,
  }
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
    room.type !== 'trip' || !room.package_id || userHasTripChatAccess(userTripBookings, tripPkgCal)

  if (room.type === 'trip' && room.package_id && effectiveMembership && !tripEligible) {
    await supabase.from('chat_room_members').delete().eq('room_id', roomId).eq('user_id', user.id)
    effectiveMembership = null
  }

  if (!effectiveMembership && room.type === 'direct') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-white/90">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-[#fcba03]/40 mx-auto" />
          <h2 className="text-xl font-bold">Private Conversation</h2>
          <p className="text-white/60 text-sm">You don&apos;t have access to this chat.</p>
          <Button asChild className="bg-[#fcba03] text-black font-bold">
            <Link href={listPath}>Back</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!effectiveMembership && room.type !== 'general' && room.type !== 'direct') {
    if (tripEligible) {
      return (
        <div className="flex-1 flex items-center justify-center px-4 text-white/90">
          <div className="text-center space-y-4">
            <MessageCircle className="h-12 w-12 text-[#fcba03]/40 mx-auto" />
            <h2 className="text-xl font-bold">You left this chat</h2>
            <p className="text-white/60 text-sm">Rejoin to see new messages and participate.</p>
            <JoinRoomButton roomId={roomId} label="Rejoin Chat" listBasePath={listPath} />
          </div>
        </div>
      )
    }

    const bookHref = packageSlug ? `/packages/${packageSlug}` : '/explore'
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-white/90">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-[#fcba03]/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip-only Chat</h2>
          <p className="text-white/60 text-sm">
            This chat is for travelers with an active, upcoming, ongoing, or completed booking for this trip.
          </p>
          <Button asChild className="bg-[#fcba03] text-black font-bold">
            <Link href={bookHref}>{packageSlug ? 'Book this trip' : 'Browse trips'}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!effectiveMembership && room.type === 'general') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-white/90">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-[#fcba03]/40 mx-auto" />
          <h2 className="text-xl font-bold">{room.name}</h2>
          <p className="text-white/60 text-sm">Join this community to see chats and participate.</p>
          <JoinRoomButton roomId={roomId} label="Join Community" listBasePath={listPath} />
        </div>
      </div>
    )
  }

  const [profile, { data: members }] = await Promise.all([
    getRequestProfile(user.id),
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId),
  ])

  if (!profile) redirect('/login')

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean) as string[]
  let bootstrapMemberProfiles: ChatMemberProfile[] = []
  if (memberIds.length > 0) {
    const { data: profilesBasic } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, phone_number, phone_public')
      .in('id', memberIds)
    bootstrapMemberProfiles = (profilesBasic || []).map(
      p =>
        ({
          ...p,
          phone_request_status: null,
          trip_chat_badge: undefined,
        }) as ChatMemberProfile,
    )
  }

  let displayName = room.name
  if (room.type === 'direct') {
    const other = bootstrapMemberProfiles.find(m => m.id !== user.id)
    if (other) displayName = other.full_name || other.username
  }

  const rowImage = (room as { image_url?: string | null }).image_url
  const roomImageUrl =
    (typeof rowImage === 'string' && rowImage.trim() !== '' ? rowImage : null) ||
    (room.type === 'trip' && pkg?.images?.[0] ? pkg.images[0] : null)

  const packageId = room.package_id ? String(room.package_id) : null

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 bg-transparent">
      <TribeRoomCoordinator
        roomId={roomId}
        roomName={displayName}
        roomType={room.type as 'trip' | 'general' | 'direct'}
        roomImageUrl={roomImageUrl}
        currentUser={profile as Profile}
        bootstrapMemberProfiles={bootstrapMemberProfiles}
        chatListPath={listPath}
        hydrator={
          <Suspense fallback={null}>
            <TribeRoomHydrationLoader
              roomId={roomId}
              userId={user.id}
              pinId={pinId}
              roomType={String(room.type)}
              packageId={packageId}
              tripPkgCal={tripPkgCal}
            />
          </Suspense>
        }
      />
    </div>
  )
}
