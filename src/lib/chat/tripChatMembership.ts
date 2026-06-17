import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Find (or create) the trip chat room for a package and return its id.
 * The room is named after the trip and uses the trip's first photo as its
 * icon; the host is added as a member. Pass a service-role client — adding the
 * host means inserting a membership row for another user, which RLS forbids on
 * the session client.
 */
export async function ensureTripChatRoom(
  svc: SupabaseClient,
  packageId: string,
): Promise<string | null> {
  const { data: pkg } = await svc
    .from('packages')
    .select('title, images, host_id')
    .eq('id', packageId)
    .single()

  const title = pkg?.title || 'Trip Chat'
  const image = Array.isArray(pkg?.images) && pkg!.images[0] ? (pkg!.images[0] as string) : null

  const { data: existing } = await svc
    .from('chat_rooms')
    .select('id')
    .eq('package_id', packageId)
    .eq('type', 'trip')
    .maybeSingle()

  let roomId = existing?.id as string | undefined
  if (!roomId) {
    const { data: created } = await svc
      .from('chat_rooms')
      .insert({
        name: title,
        type: 'trip',
        package_id: packageId,
        image_url: image,
        created_by: pkg?.host_id ?? null,
      })
      .select('id')
      .single()
    roomId = created?.id as string | undefined
  }

  if (roomId && pkg?.host_id) {
    await addTripChatMember(svc, roomId, pkg.host_id)
  }
  return roomId ?? null
}

/** Idempotently add a user to a chat room. Service-role client required for adding others. */
export async function addTripChatMember(
  svc: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<void> {
  await svc.from('chat_room_members').upsert({ room_id: roomId, user_id: userId }, { onConflict: 'room_id,user_id' })
}

/** Remove user from the trip chat room for this package (if the room exists). */
export async function removeUserFromPackageTripChat(
  supabase: SupabaseClient,
  userId: string,
  packageId: string,
): Promise<void> {
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('package_id', packageId)
    .eq('type', 'trip')
    .maybeSingle()

  if (!room?.id) return

  await supabase.from('chat_room_members').delete().eq('room_id', room.id).eq('user_id', userId)
}
