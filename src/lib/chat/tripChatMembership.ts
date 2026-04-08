import type { SupabaseClient } from '@supabase/supabase-js'

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
