'use server'

import { revalidatePath } from 'next/cache'
import { getActionAuth } from '@/lib/auth/action-auth'
import { resolvePerPersonFromPackage } from '@/lib/package-pricing'

export async function createGroupBooking(
  packageId: string,
  travelDate: string,
  maxMembers: number,
  friendIds?: string[],
  priceVariantIndex?: number,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: pkg } = await supabase
    .from('packages')
    .select('price_paise, title, slug, price_variants')
    .eq('id', packageId)
    .single()
  if (!pkg) return { error: 'Package not found' }

  let perPerson: number
  try {
    perPerson = resolvePerPersonFromPackage(pkg, priceVariantIndex ?? 0).perPerson
  } catch {
    return { error: 'Invalid price option' }
  }

  const totalAmount = perPerson * maxMembers

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

  // Add organizer as first member
  await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    status: 'accepted',
    amount_paise: perPerson,
  })

  // Get organizer profile for notification message
  const { data: organizer } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const organizerName = organizer?.full_name || organizer?.username || 'Someone'
  const priceFormatted = '₹' + (perPerson / 100).toLocaleString('en-IN')

  // Add friends as invited members and notify them (use service role to bypass RLS)
  if (friendIds && friendIds.length > 0) {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const serviceSupabase = createSC(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    for (const friendId of friendIds) {
      // Add as group member (service role bypasses auth.uid() != friendId check)
      await serviceSupabase.from('group_members').insert({
        group_id: group.id,
        user_id: friendId,
        status: 'invited',
        amount_paise: perPerson,
      })

      // Send notification with group invite link
      await serviceSupabase.from('notifications').insert({
        user_id: friendId,
        type: 'group_invite',
        title: 'Group Trip Invite!',
        body: `${organizerName} invited you to ${pkg.title} on ${new Date(travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Your share: ${priceFormatted}`,
        link: `/packages/${pkg.slug}?group=${group.id}`,
      })
    }
  }

  revalidatePath('/bookings')
  return { groupId: group.id, inviteCode: group.invite_code }
}

export async function joinGroupByInvite(inviteCode: string) {
  const { supabase, user } = await getActionAuth()
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
  const { supabase, user } = await getActionAuth()
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
  const { supabase, user } = await getActionAuth()
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
  const { supabase, user } = await getActionAuth()
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

export async function completeGroupPayment(groupId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Mark member as paid
  await supabase
    .from('group_members')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', user.id)

  // Get payer's name
  const { data: payer } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const payerName = payer?.full_name || payer?.username || 'A member'

  // Get group and package info
  const { data: group } = await supabase
    .from('group_bookings')
    .select('organizer_id, package:packages(title)')
    .eq('id', groupId)
    .single()

  if (group) {
    const pkgTitle = (group.package as unknown as { title: string })?.title || 'the trip'

    // Notify organizer
    await supabase.rpc('create_notification', {
      p_user_id: group.organizer_id,
      p_type: 'split_payment',
      p_title: 'Payment Received!',
      p_body: `${payerName} completed their payment for ${pkgTitle}`,
      p_link: '/bookings',
    })

    // Check payment status of all members
    const { data: allMembers } = await supabase
      .from('group_members')
      .select('user_id, status')
      .eq('group_id', groupId)
      .neq('status', 'declined')

    const allPaid = allMembers?.every(m => m.status === 'paid')
    const othersExceptOrganizer = allMembers?.filter(m => m.user_id !== group.organizer_id)
    const allOthersPaid = othersExceptOrganizer?.every(m => m.status === 'paid')
    const organizerPaid = allMembers?.find(m => m.user_id === group.organizer_id)?.status === 'paid'

    if (allPaid) {
      // ALL members including organizer have paid — auto-confirm
      const { createClient: createSC } = await import('@supabase/supabase-js')
      const svcSupabase = createSC(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      await svcSupabase
        .from('group_bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', groupId)

      // Get full group info for booking creation
      const { data: fullGroup } = await svcSupabase
        .from('group_bookings')
        .select('package_id, travel_date, per_person_paise')
        .eq('id', groupId)
        .single()

      if (fullGroup) {
        // Create confirmed individual bookings for each member
        const { generateConfirmationCode } = await import('@/lib/utils')
        for (const member of allMembers || []) {
          // Check if booking already exists for this user+package+date
          const { data: existing } = await svcSupabase
            .from('bookings')
            .select('id')
            .eq('user_id', member.user_id)
            .eq('package_id', fullGroup.package_id)
            .eq('travel_date', fullGroup.travel_date)
            .single()

          if (!existing) {
            await svcSupabase.from('bookings').insert({
              user_id: member.user_id,
              package_id: fullGroup.package_id,
              status: 'confirmed',
              travel_date: fullGroup.travel_date,
              guests: 1,
              total_amount_paise: fullGroup.per_person_paise,
              confirmation_code: generateConfirmationCode(),
            })
          }
        }
      }

      // Notify all members
      for (const member of allMembers || []) {
        await svcSupabase.from('notifications').insert({
          user_id: member.user_id,
          type: 'booking',
          title: 'Group Trip Confirmed!',
          body: `Everyone has paid for ${pkgTitle}. Your trip is confirmed!`,
          link: '/bookings',
        })
      }
    } else if (allOthersPaid && !organizerPaid) {
      // Everyone else paid but organizer hasn't
      await supabase.from('notifications').insert({
        user_id: group.organizer_id,
        type: 'split_payment',
        title: 'Everyone else has paid!',
        body: `All friends have paid for ${pkgTitle}. Complete your payment to confirm the group trip.`,
        link: '/bookings',
      })
    }
  }

  revalidatePath('/bookings')
  return { success: true }
}

// ── Group Cancellation Request ──────────────────────────────
export async function requestGroupCancellation(groupId: string, reason: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: group } = await supabase
    .from('group_bookings')
    .select('status, package_id, travel_date, package:packages(title)')
    .eq('id', groupId)
    .single()

  if (!group) return { error: 'Group not found' }
  if (group.status === 'cancelled') return { error: 'Already cancelled' }

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Get all group members
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .neq('status', 'declined')

  // Mark cancellation_status on ALL individual bookings for this group
  // so they appear in admin "Cancellation Requested" filter
  for (const m of members || []) {
    await svcSupabase
      .from('bookings')
      .update({
        cancellation_status: 'requested',
        cancellation_reason: `Group cancellation by member. Reason: ${reason}`,
        cancellation_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', m.user_id)
      .eq('package_id', group.package_id)
      .eq('travel_date', group.travel_date)
  }

  // Update group status to cancellation_requested (not directly cancelled)
  await supabase
    .from('group_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', groupId)

  // Get user profile for notifications
  const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
  const customerName = profile?.full_name || profile?.username || 'A user'
  const pkgTitle = (group.package as unknown as { title: string })?.title || 'a group trip'

  // Notify admins
  const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])
  for (const admin of admins || []) {
    await svcSupabase.from('notifications').insert({
      user_id: admin.id,
      type: 'booking',
      title: 'Group Cancellation Request',
      body: `${customerName} requested cancellation for group trip: ${pkgTitle}. Reason: ${reason}`,
      link: '/admin/bookings',
    })
  }

  // Notify all other group members
  for (const m of (members || []).filter(m => m.user_id !== user.id)) {
    await svcSupabase.from('notifications').insert({
      user_id: m.user_id,
      type: 'booking',
      title: 'Group Trip Cancellation Requested',
      body: `${customerName} requested cancellation for ${pkgTitle}. Admin will review and process refund.`,
      link: '/bookings',
    })
  }

  revalidatePath('/bookings')
  return { success: true }
}
