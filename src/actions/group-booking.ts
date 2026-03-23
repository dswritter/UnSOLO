'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createGroupBooking(
  packageId: string,
  travelDate: string,
  maxMembers: number,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get package price
  const { data: pkg } = await supabase.from('packages').select('price_paise, title').eq('id', packageId).single()
  if (!pkg) return { error: 'Package not found' }

  const totalAmount = pkg.price_paise * maxMembers
  const perPerson = pkg.price_paise

  const { data: group, error } = await supabase
    .from('group_bookings')
    .insert({
      package_id: packageId,
      organizer_id: user.id,
      travel_date: travelDate,
      total_amount_paise: totalAmount,
      per_person_paise: perPerson,
      max_members: maxMembers,
      status: 'open',
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Add organizer as first member (paid)
  await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    status: 'accepted',
    amount_paise: perPerson,
  })

  revalidatePath('/bookings')
  return { groupId: group.id, inviteCode: group.invite_code }
}

export async function joinGroupByInvite(inviteCode: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: group } = await supabase
    .from('group_bookings')
    .select('*, package:packages(title)')
    .eq('invite_code', inviteCode)
    .eq('status', 'open')
    .single()

  if (!group) return { error: 'Invalid or expired invite code' }

  // Check if already a member
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single()

  if (existing) return { error: 'Already a member of this group' }

  // Check if group is full
  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', group.id)
    .neq('status', 'declined')

  if ((count || 0) >= group.max_members) return { error: 'Group is full' }

  await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    status: 'accepted',
    amount_paise: group.per_person_paise,
  })

  // Notify organizer
  await supabase.rpc('create_notification', {
    p_user_id: group.organizer_id,
    p_type: 'group_invite',
    p_title: 'New Group Member',
    p_body: `Someone joined your group trip`,
    p_link: `/bookings/group/${group.id}`,
  })

  revalidatePath('/bookings')
  return { groupId: group.id }
}

export async function getGroupBooking(groupId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: group } = await supabase
    .from('group_bookings')
    .select('*, package:packages(title, slug, price_paise, destination:destinations(name, state)), organizer:profiles(username, full_name, avatar_url)')
    .eq('id', groupId)
    .single()

  if (!group) return null

  const { data: members } = await supabase
    .from('group_members')
    .select('*, user:profiles(id, username, full_name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at')

  return { group, members: members || [] }
}

export async function getMyGroupBookings() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Groups I'm a member of
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)

  if (!memberships?.length) return []

  const groupIds = memberships.map(m => m.group_id)
  const { data: groups } = await supabase
    .from('group_bookings')
    .select('*, package:packages(title, slug, destination:destinations(name, state)), organizer:profiles(username, full_name)')
    .in('id', groupIds)
    .order('created_at', { ascending: false })

  // Get member counts
  const result = []
  for (const g of groups || []) {
    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', g.id)
      .neq('status', 'declined')
    result.push({ ...g, memberCount: count || 0 })
  }

  return result
}

export async function addExpenseToGroup(groupId: string, description: string, amountPaise: number, paidBy: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // For now, store expenses in metadata or a simple approach
  // This can be expanded to a full expense splitting system
  const { data: group } = await supabase
    .from('group_bookings')
    .select('id')
    .eq('id', groupId)
    .single()

  if (!group) return { error: 'Group not found' }

  // Notify all members
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .neq('user_id', user.id)

  for (const m of members || []) {
    await supabase.rpc('create_notification', {
      p_user_id: m.user_id,
      p_type: 'split_payment',
      p_title: 'New Group Expense',
      p_body: `${description} - ₹${(amountPaise / 100).toLocaleString('en-IN')}`,
      p_link: `/bookings/group/${groupId}`,
    })
  }

  return { success: true }
}
