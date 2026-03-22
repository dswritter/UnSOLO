'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const updates = {
    full_name: formData.get('fullName') as string,
    bio: formData.get('bio') as string,
    location: formData.get('location') as string,
    instagram_url: formData.get('instagram') as string || null,
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
