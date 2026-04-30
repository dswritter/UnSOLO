'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Convert Instagram handle to full URL
  const instaHandle = (formData.get('instagram') as string || '').trim().replace(/^@/, '')
  const instaUrl = instaHandle ? `https://instagram.com/${instaHandle}` : null

  // Validate Instagram handle format
  if (instaHandle && !/^[a-zA-Z0-9._]{1,30}$/.test(instaHandle)) {
    return { error: 'Invalid Instagram handle. Use only letters, numbers, periods and underscores.' }
  }

  const dob = formData.get('date_of_birth') as string || null

  const updates: Record<string, unknown> = {
    full_name: formData.get('fullName') as string,
    bio: formData.get('bio') as string,
    location: formData.get('location') as string,
    instagram_url: instaUrl,
    website_url: formData.get('website') as string || null,
    updated_at: new Date().toISOString(),
  }

  if (dob) {
    updates.date_of_birth = dob
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/profile')
  return { success: true }
}

export async function updateUsername(newUsername: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Validate format
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/
  if (!usernameRegex.test(newUsername)) {
    return { error: 'Username must be 3-30 characters, letters, numbers, and underscores only' }
  }

  // Get current profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, username_changed_at')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  // Same username — no-op
  if (profile.username === newUsername) {
    return { success: true }
  }

  // Check 40-day cooldown
  if (profile.username_changed_at) {
    const lastChanged = new Date(profile.username_changed_at)
    const cooldownEnd = new Date(lastChanged.getTime() + 40 * 24 * 60 * 60 * 1000)
    const now = new Date()
    if (now < cooldownEnd) {
      const daysLeft = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      return { error: `You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` }
    }
  }

  // Check uniqueness
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', newUsername)
    .single()

  if (existing) {
    return { error: 'This username is already taken' }
  }

  // Update
  const { error } = await supabase
    .from('profiles')
    .update({
      username: newUsername,
      username_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/profile')
  return { success: true }
}

export async function getProfile(username: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()
  return data
}

export async function getCurrentUserProfile() {
  const { supabase, user } = await getActionAuth()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

// ── Reviews ──────────────────────────────────────────────────

export async function submitReview(
  bookingId: string,
  packageId: string,
  ratingDestination: number,
  ratingExperience: number,
  title: string,
  body: string,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Verify the booking belongs to this user and is completed
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status !== 'completed') return { error: 'Can only review completed trips' }

  // Check for existing review
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (existing) return { error: 'You have already reviewed this trip' }

  const avgRating = Math.round((ratingDestination + ratingExperience) / 2)

  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId,
    user_id: user.id,
    package_id: packageId,
    rating: avgRating,
    rating_destination: ratingDestination,
    rating_experience: ratingExperience,
    title: title || null,
    body: body || null,
  })

  if (error) return { error: error.message }

  // Update leaderboard
  const { data: scores } = await supabase
    .from('leaderboard_scores')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (scores) {
    await supabase
      .from('leaderboard_scores')
      .update({
        reviews_written: scores.reviews_written + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
  }

  // Award reviewer badge
  const { count } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (count && count >= 5) {
    await supabase.from('user_achievements').upsert({
      user_id: user.id,
      achievement_key: 'reviewer_5',
    })
  }
  if (count && count >= 10) {
    await supabase.from('user_achievements').upsert({
      user_id: user.id,
      achievement_key: 'storyteller',
    })
  }

  revalidatePath(`/bookings`)
  return { success: true }
}

// ── Phone Privacy ────────────────────────────────────────────

export async function updatePhoneSettings(phone: string, isPublic: boolean) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ phone_number: phone || null, phone_public: isPublic })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')
  return { success: true }
}

export async function requestPhoneAccess(targetUserId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === targetUserId) return { error: 'Cannot request your own number' }

  const { error } = await supabase.from('phone_requests').upsert({
    requester_id: user.id,
    target_id: targetUserId,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'requester_id,target_id' })

  if (error) return { error: error.message }

  // Create in-app notification
  await supabase.rpc('create_notification', {
    p_user_id: targetUserId,
    p_type: 'phone_request',
    p_title: 'Phone Number Request',
    p_body: 'Someone requested access to your phone number',
    p_link: '/profile',
  })

  // Send a DM notification to the target user
  const { data: requesterProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()

  if (requesterProfile) {
    // Get or create DM room
    const { data: roomId } = await supabase.rpc('get_or_create_dm_room', {
      user_a: user.id,
      user_b: targetUserId,
    })

    if (roomId) {
      await supabase.from('messages').insert({
        room_id: roomId,
        user_id: user.id,
        content: `📱 ${requesterProfile.full_name || requesterProfile.username} has requested access to your phone number. Go to Edit Profile → Phone settings to manage requests.`,
        message_type: 'system',
      })
    }
  }

  return { success: true }
}

export async function respondToPhoneRequest(requestId: string, approve: boolean) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('phone_requests')
    .update({ status: approve ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('target_id', user.id)

  if (error) return { error: error.message }

  // Mark related phone_request notifications as read
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('type', 'phone_request')
    .eq('is_read', false)

  return { success: true }
}

export async function getPhoneRequests() {
  const { supabase, user } = await getActionAuth()
  if (!user) return []

  const { data } = await supabase
    .from('phone_requests')
    .select('*, requester:profiles!phone_requests_requester_id_fkey(username, full_name, avatar_url)')
    .eq('target_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return data || []
}

// ── Follows ──────────────────────────────────────────────────

export async function followUser(targetUserId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === targetUserId) return { error: 'Cannot follow yourself' }

  const { error } = await supabase.from('follows').insert({
    follower_id: user.id,
    following_id: targetUserId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'Already following' }
    return { error: error.message }
  }
  return { success: true }
}

export async function unfollowUser(targetUserId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function getFollowData(profileId: string, viewerUserId: string | null) {
  const supabase = await createClient()

  const [
    { count: followersCount },
    { count: followingCount },
    { data: followers },
    { data: following },
  ] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileId),
    supabase.from('follows').select('*, follower:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)').eq('following_id', profileId).limit(50),
    supabase.from('follows').select('*, following:profiles!follows_following_id_fkey(id, username, full_name, avatar_url)').eq('follower_id', profileId).limit(50),
  ])

  let isFollowing = false
  if (viewerUserId) {
    const { data } = await supabase.from('follows').select('id').eq('follower_id', viewerUserId).eq('following_id', profileId).single()
    isFollowing = !!data
  }

  return {
    followersCount: followersCount || 0,
    followingCount: followingCount || 0,
    followers: followers || [],
    following: following || [],
    isFollowing,
  }
}

// ── Direct Messaging ─────────────────────────────────────────

export async function startDirectMessage(targetUserId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === targetUserId) return { error: 'Cannot DM yourself' }

  // Get or create DM room
  const { data: roomId, error } = await supabase.rpc('get_or_create_dm_room', {
    user_a: user.id,
    user_b: targetUserId,
  })

  if (error) return { error: error.message }
  return { roomId }
}

// ── Privacy Settings ─────────────────────────────────────────

export async function updatePrivacySettings(tripsPrivate: boolean, statesPrivate: boolean) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ trips_private: tripsPrivate, states_private: statesPrivate })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')
  return { success: true }
}

// ── User Status ──────────────────────────────────────────────

export async function updateStatus(statusText: string, visibility: 'public' | 'followers', isCustom: boolean) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  if (statusText.length > 100) return { error: 'Status must be 100 characters or less' }

  const { error } = await supabase
    .from('profiles')
    .update({
      status_text: statusText || 'Still deciding my next trip',
      status_visibility: visibility,
      custom_status: isCustom,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/profile')
  return { success: true }
}

// ── Online Presence ──────────────────────────────────────────

export async function updatePresence(online: boolean) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  await supabase.rpc('upsert_presence', { p_user_id: user.id, p_online: online })
  return { success: true }
}

export async function getOnlineUsers() {
  const supabase = await createClient()
  // Users who were online in last 2 minutes (matches heartbeat interval)
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('user_presence')
    .select('user_id, last_seen, is_online, profile:profiles(id, username, full_name, avatar_url)')
    .eq('is_online', true)
    .gte('last_seen', twoMinAgo)
    .limit(50)

  return data || []
}

// ── Community Search ─────────────────────────────────────────

export async function searchCommunityMembers(query: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return []

  const search = query.trim().toLowerCase()
  if (search.length < 2) return []

  const { data } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, location')
    .or(`username.ilike.%${search}%,full_name.ilike.%${search}%`)
    .neq('id', user.id)
    .limit(20)

  return data || []
}

/** Prefix match on username or full name (no @ required). For status audience picker. */
export async function searchProfilesForStatusAudience(query: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return []

  const q = query.trim().replace(/[%_]/g, '').slice(0, 40)
  if (q.length < 1) return []

  const pattern = `${q}%`
  const [{ data: byUser }, { data: byName }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .ilike('username', pattern)
      .neq('id', user.id)
      .limit(10),
    supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .ilike('full_name', pattern)
      .neq('id', user.id)
      .limit(10),
  ])

  const map = new Map<string, { id: string; username: string; full_name: string | null; avatar_url: string | null }>()
  for (const row of [...(byUser || []), ...(byName || [])]) {
    map.set(row.id, row)
  }
  return [...map.values()].slice(0, 12)
}

// ── Frequent & Recent Contacts ──────────────────────────────

export async function getFrequentContacts() {
  const { supabase, user } = await getActionAuth()
  if (!user) return { recent: [], frequent: [] }

  // Get all my messages in DM rooms (most recent first)
  const { data: recentDMs } = await supabase
    .from('messages')
    .select('room_id, created_at, chat_room:chat_rooms!inner(type)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  const dmMessages = (recentDMs || []).filter(
    (m) => (m.chat_room as unknown as { type: string })?.type === 'direct'
  )

  // Unique room IDs ordered by most recent
  const seenRooms = new Set<string>()
  const recentRoomIds: string[] = []
  const roomMessageCount: Record<string, number> = {}
  for (const m of dmMessages) {
    roomMessageCount[m.room_id] = (roomMessageCount[m.room_id] || 0) + 1
    if (!seenRooms.has(m.room_id)) {
      seenRooms.add(m.room_id)
      recentRoomIds.push(m.room_id)
    }
  }

  // Helper: get the other person in a DM room
  async function getPartner(roomId: string) {
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id, profile:profiles(id, username, full_name, avatar_url, bio, location)')
      .eq('room_id', roomId)
      .neq('user_id', user!.id)
      .limit(1)
    if (members && members.length > 0) {
      return members[0].profile as unknown as { id: string; username: string; full_name: string | null; avatar_url: string | null; bio: string | null; location: string | null }
    }
    return null
  }

  // Recent contacts (up to 8)
  const recentContacts: { id: string; username: string; full_name: string | null; avatar_url: string | null; bio: string | null; location: string | null }[] = []
  const seenIds = new Set<string>()
  for (const roomId of recentRoomIds.slice(0, 8)) {
    const p = await getPartner(roomId)
    if (p && !seenIds.has(p.id)) {
      seenIds.add(p.id)
      recentContacts.push(p)
    }
  }

  // Frequent contacts (sorted by message count, up to 8)
  const frequentRoomIds = Object.entries(roomMessageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([roomId]) => roomId)

  const frequentContacts: { id: string; username: string; full_name: string | null; avatar_url: string | null; bio: string | null; location: string | null; messageCount: number }[] = []
  for (const roomId of frequentRoomIds) {
    const p = await getPartner(roomId)
    if (p && !frequentContacts.find(c => c.id === p.id)) {
      frequentContacts.push({ ...p, messageCount: roomMessageCount[roomId] })
    }
  }

  return { recent: recentContacts, frequent: frequentContacts }
}

// ── Referral Dashboard ────────────────────────────────────────

export async function getReferralDashboard() {
  const { supabase, user } = await getActionAuth()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, referral_credits_paise')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  // Count referrals by status
  const { data: referrals } = await supabase
    .from('referrals')
    .select('status, referred:profiles!referrals_referred_id_fkey(username, full_name)')
    .eq('referrer_id', user.id)

  const total = referrals?.length || 0
  const pending = referrals?.filter(r => r.status === 'pending').length || 0
  const credited = referrals?.filter(r => r.status === 'credited').length || 0

  return {
    referralCode: profile.referral_code,
    creditsPaise: profile.referral_credits_paise || 0,
    totalReferred: total,
    pendingReferred: pending,
    creditedReferred: credited,
    referrals: (referrals || []).map(r => ({
      status: r.status,
      username: (r.referred as unknown as { username: string })?.username,
      fullName: (r.referred as unknown as { full_name: string | null })?.full_name,
    })),
  }
}

// ── Get user's available credits for checkout ─────────────────

export async function getUserCredits() {
  const { supabase, user } = await getActionAuth()
  if (!user) return { credits: 0, isReferred: false, isFirstBooking: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_credits_paise, referred_by')
    .eq('id', user.id)
    .single()

  // Check if first booking
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'completed'])

  return {
    credits: profile?.referral_credits_paise || 0,
    isReferred: !!profile?.referred_by,
    isFirstBooking: (count || 0) === 0,
  }
}
