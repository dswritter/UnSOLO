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

  const sorted = (rows || []) as unknown as StatusStripStory[]
  const byAuthor = new Map<string, StatusStripStory>()
  for (const s of sorted) {
    if (!byAuthor.has(s.author_id)) byAuthor.set(s.author_id, s)
  }
  const list = [...byAuthor.values()]
  list.sort((a, b) => {
    if (a.author_id === user.id) return -1
    if (b.author_id === user.id) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return { stories: list, currentUserId: user.id }
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

export async function createStatusStory(input: {
  mediaUrl: string
  mode: StatusStoryAudience['mode']
  excludeUsernames?: string
  includeUsernames?: string
  includeRoomIds?: string[]
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const expires = new Date()
  expires.setTime(expires.getTime() + 24 * 60 * 60 * 1000)

  let audience: StatusStoryAudience = { mode: input.mode }

  if (input.mode === 'all' && input.excludeUsernames?.trim()) {
    audience.exclude_user_ids = await usernamesToIds(input.excludeUsernames)
  }
  if (input.mode === 'users') {
    const ids = await usernamesToIds(input.includeUsernames || '')
    if (!ids.length) return { error: 'Add at least one username for “Specific users”' }
    audience.include_user_ids = ids
  }
  if (input.mode === 'communities') {
    const ids = input.includeRoomIds?.filter(Boolean) || []
    if (!ids.length) return { error: 'Select at least one community' }
    audience.include_room_ids = ids
  }

  const { error } = await supabase.from('status_stories').insert({
    author_id: user.id,
    media_url: input.mediaUrl,
    media_type: 'image',
    expires_at: expires.toISOString(),
    audience: serializeAudience(audience),
  })

  if (error) return { error: error.message }

  const { data: prof } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  revalidatePath('/')
  if (prof?.username) revalidatePath(`/profile/${prof.username}`)
  return {}
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
