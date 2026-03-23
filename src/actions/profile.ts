'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Convert Instagram handle to full URL
  const instaHandle = (formData.get('instagram') as string || '').trim().replace(/^@/, '')
  const instaUrl = instaHandle ? `https://instagram.com/${instaHandle}` : null

  // Validate Instagram handle format
  if (instaHandle && !/^[a-zA-Z0-9._]{1,30}$/.test(instaHandle)) {
    return { error: 'Invalid Instagram handle. Use only letters, numbers, periods and underscores.' }
  }

  const updates = {
    full_name: formData.get('fullName') as string,
    bio: formData.get('bio') as string,
    location: formData.get('location') as string,
    instagram_url: instaUrl,
    website_url: formData.get('website') as string || null,
    updated_at: new Date().toISOString(),
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === targetUserId) return { error: 'Cannot request your own number' }

  const { error } = await supabase.from('phone_requests').upsert({
    requester_id: user.id,
    target_id: targetUserId,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'requester_id,target_id' })

  if (error) return { error: error.message }
  return { success: true }
}

export async function respondToPhoneRequest(requestId: string, approve: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('phone_requests')
    .update({ status: approve ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('target_id', user.id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function getPhoneRequests() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function getFollowData(profileId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
  if (user) {
    const { data } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', profileId).single()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  await supabase.rpc('upsert_presence', { p_user_id: user.id, p_online: online })
  return { success: true }
}

export async function getOnlineUsers() {
  const supabase = await createClient()
  // Users who were online in last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('user_presence')
    .select('user_id, last_seen, is_online, profile:profiles(id, username, full_name, avatar_url)')
    .eq('is_online', true)
    .gte('last_seen', fiveMinAgo)
    .limit(50)

  return data || []
}

// ── Community Search ─────────────────────────────────────────

export async function searchCommunityMembers(query: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
