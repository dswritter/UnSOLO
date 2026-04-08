'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { serializeAudience, type StatusStoryAudience } from '@/lib/statusStories/audience'

export type StatusStripStory = {
  id: string
  author_id: string
  media_url: string
  created_at: string
  expires_at: string
  author: {
    username: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

async function usernamesToIds(usernamesCsv: string): Promise<string[]> {
  const supabase = await createClient()
  const parts = usernamesCsv
    .split(/[\s,]+/)
    .map(s => s.trim().replace(/^@/, ''))
    .filter(Boolean)
  if (!parts.length) return []
  const { data } = await supabase.from('profiles').select('id').in('username', parts)
  return (data || []).map(r => r.id)
}

export async function getMyGeneralRoomsForStatus(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('chat_room_members')
    .select('room_id, room:chat_rooms(id, name, type)')
    .eq('user_id', user.id)

  const out: { id: string; name: string }[] = []
  for (const row of data || []) {
    const room = row.room as { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null
    const r = Array.isArray(room) ? room[0] : room
    if (r && r.type === 'general') out.push({ id: r.id, name: r.name })
  }
  return out
}

export async function countActiveStatusStoriesForUser(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count, error } = await supabase
    .from('status_stories')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gt('expires_at', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}

export async function getStatusStripForHome(): Promise<{ stories: StatusStripStory[]; currentUserId: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { stories: [], currentUserId: null }

  const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
  const followingIds = [...new Set((follows || []).map(f => f.following_id))]
  const authorIds = [user.id, ...followingIds]

  const { data: rows } = await supabase
    .from('status_stories')
    .select('id, author_id, media_url, created_at, expires_at, author:profiles(username, full_name, avatar_url)')
    .gt('expires_at', new Date().toISOString())
    .in('author_id', authorIds)
    .order('created_at', { ascending: false })

  return { stories: (rows || []) as unknown as StatusStripStory[], currentUserId: user.id }
}

export async function getStatusStoriesForProfile(authorId: string): Promise<StatusStripStory[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await supabase
    .from('status_stories')
    .select('id, author_id, media_url, created_at, expires_at, author:profiles(username, full_name, avatar_url)')
    .eq('author_id', authorId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (rows || []) as unknown as StatusStripStory[]
}

const MAX_ACTIVE_STATUS_PER_USER = 3

async function buildAudiencePayload(input: {
  mode: StatusStoryAudience['mode']
  excludeUsernames?: string
  includeUsernames?: string
  includeRoomIds?: string[]
}): Promise<{ audience: StatusStoryAudience; error?: string }> {
  let audience: StatusStoryAudience = { mode: input.mode }

  if (input.mode === 'all' && input.excludeUsernames?.trim()) {
    audience.exclude_user_ids = await usernamesToIds(input.excludeUsernames)
  }
  if (input.mode === 'users') {
    const ids = await usernamesToIds(input.includeUsernames || '')
    if (!ids.length) return { audience, error: 'Add at least one username for “Specific users”' }
    audience.include_user_ids = ids
  }
  if (input.mode === 'communities') {
    const ids = input.includeRoomIds?.filter(Boolean) || []
    if (!ids.length) return { audience, error: 'Select at least one community' }
    audience.include_room_ids = ids
  }
  return { audience }
}

export async function createStatusStories(input: {
  mediaUrls: string[]
  mode: StatusStoryAudience['mode']
  excludeUsernames?: string
  includeUsernames?: string
  includeRoomIds?: string[]
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const urls = input.mediaUrls.map(u => u.trim()).filter(Boolean)
  if (!urls.length) return { error: 'Add at least one photo' }
  if (urls.length > MAX_ACTIVE_STATUS_PER_USER) return { error: `You can share up to ${MAX_ACTIVE_STATUS_PER_USER} photos at once` }

  const { count: existing } = await supabase
    .from('status_stories')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gt('expires_at', new Date().toISOString())

  const n = existing ?? 0
  if (n + urls.length > MAX_ACTIVE_STATUS_PER_USER) {
    return {
      error: `You can have at most ${MAX_ACTIVE_STATUS_PER_USER} active status photos. Remove some or wait for them to expire.`,
    }
  }

  const { audience, error: audErr } = await buildAudiencePayload(input)
  if (audErr) return { error: audErr }

  const expires = new Date()
  expires.setTime(expires.getTime() + 24 * 60 * 60 * 1000)
  const audienceJson = serializeAudience(audience)

  for (const media_url of urls) {
    const { error } = await supabase.from('status_stories').insert({
      author_id: user.id,
      media_url,
      media_type: 'image',
      expires_at: expires.toISOString(),
      audience: audienceJson,
    })
    if (error) return { error: error.message }
  }

  const { data: prof } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  revalidatePath('/')
  if (prof?.username) revalidatePath(`/profile/${prof.username}`)
  return {}
}

/** @deprecated use createStatusStories */
export async function createStatusStory(input: {
  mediaUrl: string
  mode: StatusStoryAudience['mode']
  excludeUsernames?: string
  includeUsernames?: string
  includeRoomIds?: string[]
}): Promise<{ error?: string }> {
  return createStatusStories({
    mediaUrls: [input.mediaUrl],
    mode: input.mode,
    excludeUsernames: input.excludeUsernames,
    includeUsernames: input.includeUsernames,
    includeRoomIds: input.includeRoomIds,
  })
}

export async function deleteStatusStory(storyId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: prof } = await supabase.from('profiles').select('username').eq('id', user.id).single()

  const { error } = await supabase.from('status_stories').delete().eq('id', storyId).eq('author_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/')
  if (prof?.username) revalidatePath(`/profile/${prof.username}`)
  return {}
}
