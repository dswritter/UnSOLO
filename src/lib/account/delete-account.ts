/**
 * Account deletion (Settings on web, Android and iOS; required by Google Play and the App Store).
 *
 * What goes: the profile's name, photo, bio, phone and date of birth; Tribe posts, comments,
 * reactions, saves, plans joined, stories, follows, chat messages and memberships, notifications,
 * devices, preferences, points and enquiries; the login (email, phone, Google/Apple identities).
 *
 * What stays, with personal details stripped: bookings and payments (tax and refund records must be
 * kept for years). Their traveller names and special requests are cleared, and they point at an
 * anonymous "Deleted traveller" profile.
 *
 * The login is hard-deleted when nothing else references the profile; otherwise (bookings, reviews,
 * referrals…) Supabase's soft delete removes its email, phone and identities so it can't sign in and
 * the same email or phone can sign up afresh.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type DeleteResult =
  | { ok: true; mode: 'deleted' | 'anonymised' }
  | { ok: false; code: 'upcoming_trip' | 'active_listings' | 'server_error'; error: string }

/** [table, column] rows owned by the user that are removed outright. */
export const OWNED_ROWS: [string, string][] = [
  ['post_comments', 'author_id'], ['post_reactions', 'user_id'], ['saved_posts', 'user_id'], ['post_tags', 'user_id'],
  ['plan_members', 'user_id'], ['host_offers', 'host_id'], ['posts', 'author_id'],
  ['status_story_views', 'viewer_id'], ['status_stories', 'author_id'],
  ['follows', 'follower_id'], ['follows', 'following_id'],
  ['message_reactions', 'user_id'], ['message_read_receipts', 'user_id'], ['messages', 'user_id'],
  ['chat_room_members', 'user_id'], ['chat_sidebar_room_pins', 'user_id'], ['chat_poll_votes', 'user_id'],
  ['notifications', 'user_id'], ['device_tokens', 'user_id'], ['user_preferences', 'user_id'],
  ['profile_private', 'user_id'], ['user_presence', 'user_id'], ['package_interests', 'user_id'],
  ['leaderboard_scores', 'user_id'], ['user_achievements', 'user_id'], ['custom_date_requests', 'user_id'],
  ['join_requests', 'user_id'], ['phone_requests', 'requester_id'], ['phone_requests', 'target_id'],
  ['phone_otp_verifications', 'user_id'], ['phone_change_requests', 'user_id'], ['listing_drafts', 'host_id'],
]

const today = (now: Date) => now.toISOString().slice(0, 10)

export async function deleteAccount(svc: SupabaseClient, userId: string, now = new Date()): Promise<DeleteResult> {
  // 1. Things that need a person, not a button: a paid trip still to come, or live listings.
  const [{ count: upcoming }, { count: livePackages }, { count: liveListings }] = await Promise.all([
    svc.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'confirmed').gte('travel_date', today(now)),
    svc.from('packages').select('id', { count: 'exact', head: true }).eq('host_id', userId).eq('is_active', true),
    svc.from('service_listings').select('id', { count: 'exact', head: true }).eq('host_id', userId).eq('is_active', true),
  ])
  if ((upcoming ?? 0) > 0) {
    return { ok: false, code: 'upcoming_trip', error: 'You have an upcoming trip. Cancel it first (refunds follow the trip’s policy), or write to hello@unsolo.in and we’ll help.' }
  }
  if ((livePackages ?? 0) + (liveListings ?? 0) > 0) {
    return { ok: false, code: 'active_listings', error: 'You have live trips or listings. Pause them in Hosting first, or write to hello@unsolo.in and we’ll help.' }
  }

  // 2. Remove what the person made. A missing table (older database) is skipped, not fatal.
  for (const [table, col] of OWNED_ROWS) {
    const { error } = await svc.from(table).delete().eq(col, userId)
    if (error && !isMissingRelation(error)) console.error(`[delete-account] ${table}.${col}:`, error.message)
  }

  // 3. Keep bookings for the records, without the personal details.
  const { error: bErr } = await svc.from('bookings').update({ traveller_details: null, special_requests: null }).eq('user_id', userId)
  if (bErr && !isMissingRelation(bErr)) console.error('[delete-account] bookings:', bErr.message)

  // 4. The profile row stays only as an anonymous anchor for those records.
  const { error: pErr } = await svc.from('profiles').update({
    full_name: 'Deleted traveller', username: `deleted_${userId.replace(/-/g, '').slice(0, 12)}`, avatar_url: null, bio: null,
    phone_number: null, is_phone_verified: false, date_of_birth: null, is_host: false, updated_at: now.toISOString(),
  }).eq('id', userId)
  if (pErr) {
    console.error('[delete-account] profile:', pErr.message)
    return { ok: false, code: 'server_error', error: 'We couldn’t delete your account just now. Try again, or write to hello@unsolo.in.' }
  }

  // 5. The login: gone if nothing points at it, otherwise Supabase's soft delete (no email, phone or identities left).
  const hard = await svc.auth.admin.deleteUser(userId)
  if (!hard.error) return { ok: true, mode: 'deleted' }
  const soft = await svc.auth.admin.deleteUser(userId, true)
  if (soft.error) {
    console.error('[delete-account] auth:', hard.error.message, '/', soft.error.message)
    return { ok: false, code: 'server_error', error: 'We couldn’t finish deleting your account. Write to hello@unsolo.in and we’ll complete it.' }
  }
  return { ok: true, mode: 'anonymised' }
}

function isMissingRelation(e: { code?: string; message?: string }) {
  return e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /does not exist|could not find the table/i.test(e.message ?? '')
}
