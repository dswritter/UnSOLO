import type { SupabaseClient } from '@supabase/supabase-js'

/** Limit chat spam: count messages by this user in the last window (RLS: only visible rooms). */
export async function assertMessageSendRateLimit(
  supabase: SupabaseClient,
  userId: string,
  maxPerMinute = 35,
): Promise<{ error?: string }> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) return { error: 'Could not verify send rate. Try again.' }
  if ((count ?? 0) >= maxPerMinute) {
    return { error: 'You are sending messages too quickly. Please wait a moment.' }
  }
  return {}
}

/** Limit payment order creation (bots hammering checkout). */
export async function assertBookingOrderRateLimit(
  supabase: SupabaseClient,
  userId: string,
  maxPerTwoMinutes = 10,
): Promise<{ error?: string }> {
  const since = new Date(Date.now() - 120_000).toISOString()
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) return { error: 'Could not verify booking rate. Try again.' }
  if ((count ?? 0) >= maxPerTwoMinutes) {
    return { error: 'Too many booking attempts. Please wait a couple of minutes and try again.' }
  }
  return {}
}
