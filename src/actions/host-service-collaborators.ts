'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ServiceListingCollaborator } from '@/types'

const MAX_COLLABORATORS = 10

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key)
}

/**
 * Resolve "the person the host typed in" to a profile id. Accepts exact
 * username match or exact email match. Case-insensitive on both.
 */
async function resolveInviteeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  handle: string,
): Promise<string | null> {
  const query = handle.trim()
  if (!query) return null

  // username first (exact, case-insensitive)
  const { data: byUsername } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', query)
    .maybeSingle()
  if (byUsername?.id) return byUsername.id

  // email fallback — needs service-role because profiles.email RLS may hide
  // it from other users. If the key isn't configured, fall back to the
  // anon client (will only resolve if the policy exposes it).
  const svc = serviceClient()
  const { data: byEmail } = await (svc ?? supabase)
    .from('profiles')
    .select('id')
    .ilike('email', query)
    .maybeSingle()
  return byEmail?.id ?? null
}

/** List everyone on this listing (pending + accepted + declined), with profile info. */
export async function listServiceListingCollaborators(
  listingId: string,
): Promise<{ collaborators: ServiceListingCollaborator[] } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_listing_collaborators')
    .select(`
      id, listing_id, user_id, added_by, status,
      notify_on_booking, responded_at, created_at,
      profile:profiles!service_listing_collaborators_user_id_fkey(
        id, username, full_name, avatar_url
      )
    `)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('listServiceListingCollaborators:', error)
    return { error: 'Failed to load collaborators' }
  }
  return { collaborators: (data || []) as unknown as ServiceListingCollaborator[] }
}

/** Invite someone as a co-host. Primary host only. Sends an in-app notification. */
export async function inviteServiceListingCollaborator(
  listingId: string,
  handle: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: listing } = await supabase
    .from('service_listings')
    .select('id, host_id, title')
    .eq('id', listingId)
    .single()
  if (!listing) return { error: 'Listing not found' }
  if (listing.host_id !== user.id) return { error: 'Only the primary host can invite co-hosts' }

  const inviteeId = await resolveInviteeId(supabase, handle)
  if (!inviteeId) return { error: 'No user found for that username or email' }
  if (inviteeId === user.id) return { error: `You're already the primary host` }

  // Pre-check caps + duplicates in app so we can give a readable error
  // before the DB's trigger / unique constraint takes over.
  const { data: existingRows } = await supabase
    .from('service_listing_collaborators')
    .select('user_id, status')
    .eq('listing_id', listingId)

  const already = (existingRows || []).find(r => r.user_id === inviteeId)
  if (already) {
    if (already.status === 'accepted') return { error: 'This person is already a co-host' }
    if (already.status === 'pending') return { error: 'An invite is already pending for this person' }
    // declined: allow re-invite by deleting the old row first
    await supabase.from('service_listing_collaborators').delete()
      .eq('listing_id', listingId).eq('user_id', inviteeId)
  }

  const acceptedCount = (existingRows || []).filter(r => r.status === 'accepted').length
  if (acceptedCount >= MAX_COLLABORATORS) {
    return { error: `Max ${MAX_COLLABORATORS} co-hosts per listing` }
  }

  const { error: insertErr } = await supabase
    .from('service_listing_collaborators')
    .insert({
      listing_id: listingId,
      user_id: inviteeId,
      added_by: user.id,
      status: 'pending',
    })
  if (insertErr) {
    console.error('inviteServiceListingCollaborator:', insertErr)
    return { error: 'Failed to send invite' }
  }

  const svc = serviceClient()
  if (svc) {
    const { data: host } = await svc.from('profiles')
      .select('full_name, username').eq('id', user.id).single()
    const hostName = host?.full_name || host?.username || 'A host'
    await svc.from('notifications').insert({
      user_id: inviteeId,
      type: 'group_invite',
      title: 'Co-host invitation',
      body: `${hostName} invited you to co-host "${listing.title}".`,
      link: '/host/invitations',
      metadata: { listing_id: listingId, kind: 'service_listing_collab' },
    })
  }

  return { success: true }
}

/** Invitee accepts or declines. */
export async function respondToCollaboratorInvite(
  collaboratorId: string,
  response: 'accepted' | 'declined',
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: row } = await supabase
    .from('service_listing_collaborators')
    .select('id, listing_id, user_id, added_by, status')
    .eq('id', collaboratorId)
    .single()
  if (!row) return { error: 'Invite not found' }
  if (row.user_id !== user.id) return { error: 'Not your invite' }
  if (row.status !== 'pending') return { error: 'This invite has already been responded to' }

  const { error } = await supabase
    .from('service_listing_collaborators')
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq('id', collaboratorId)
  if (error) {
    console.error('respondToCollaboratorInvite:', error)
    return { error: 'Failed to update invite' }
  }

  // Let the primary host know.
  const svc = serviceClient()
  if (svc) {
    const { data: listing } = await svc.from('service_listings')
      .select('title').eq('id', row.listing_id).single()
    const { data: invitee } = await svc.from('profiles')
      .select('full_name, username').eq('id', user.id).single()
    const name = invitee?.full_name || invitee?.username || 'Someone'
    const verb = response === 'accepted' ? 'accepted' : 'declined'
    await svc.from('notifications').insert({
      user_id: row.added_by,
      type: 'group_invite',
      title: `Co-host invite ${verb}`,
      body: `${name} ${verb} your invite to co-host "${listing?.title ?? 'your listing'}".`,
      link: `/host/listings`,
      metadata: { listing_id: row.listing_id, kind: 'service_listing_collab_response' },
    })
  }

  return { success: true }
}

/** Primary host removes a co-host, or a co-host leaves. */
export async function removeServiceListingCollaborator(
  collaboratorId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: row } = await supabase
    .from('service_listing_collaborators')
    .select('id, listing_id, user_id')
    .eq('id', collaboratorId)
    .single()
  if (!row) return { error: 'Collaborator not found' }

  const { data: listing } = await supabase
    .from('service_listings')
    .select('host_id')
    .eq('id', row.listing_id)
    .single()

  const isPrimary = listing?.host_id === user.id
  const isSelf = row.user_id === user.id
  if (!isPrimary && !isSelf) return { error: 'Not allowed' }

  const { error } = await supabase
    .from('service_listing_collaborators')
    .delete()
    .eq('id', collaboratorId)
  if (error) {
    console.error('removeServiceListingCollaborator:', error)
    return { error: 'Failed to remove' }
  }
  return { success: true }
}

/** Primary host toggles booking-notification opt-in per co-host. */
export async function toggleCollaboratorNotifyOnBooking(
  collaboratorId: string,
  notify: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: row } = await supabase
    .from('service_listing_collaborators')
    .select('id, listing_id')
    .eq('id', collaboratorId)
    .single()
  if (!row) return { error: 'Collaborator not found' }

  const { data: listing } = await supabase
    .from('service_listings')
    .select('host_id')
    .eq('id', row.listing_id)
    .single()
  if (listing?.host_id !== user.id) return { error: 'Only the primary host can change this' }

  const { error } = await supabase
    .from('service_listing_collaborators')
    .update({ notify_on_booking: notify })
    .eq('id', collaboratorId)
  if (error) return { error: 'Failed to update' }
  return { success: true }
}

/** List pending invites for the currently signed-in user (for the invitations page). */
export async function listPendingCollaboratorInvites(): Promise<
  | {
      invites: Array<
        ServiceListingCollaborator & { listing_title: string; listing_slug: string; listing_type: string }
      >
    }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('service_listing_collaborators')
    .select(`
      id, listing_id, user_id, added_by, status,
      notify_on_booking, responded_at, created_at,
      listing:service_listings!service_listing_collaborators_listing_id_fkey(
        title, slug, type
      ),
      inviter:profiles!service_listing_collaborators_added_by_fkey(
        id, username, full_name, avatar_url
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('listPendingCollaboratorInvites:', error)
    return { error: 'Failed to load invites' }
  }

  type Row = ServiceListingCollaborator & {
    listing?: { title: string; slug: string; type: string } | null
    inviter?: {
      id: string
      username: string
      full_name: string | null
      avatar_url: string | null
    } | null
  }

  const invites = ((data || []) as unknown as Row[]).map(r => ({
    ...r,
    listing_title: r.listing?.title ?? '(untitled listing)',
    listing_slug: r.listing?.slug ?? '',
    listing_type: r.listing?.type ?? '',
    profile: r.inviter ?? undefined,
  }))

  return { invites }
}
