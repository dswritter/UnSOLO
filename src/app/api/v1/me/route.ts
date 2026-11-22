import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { toUserLite, PROFILE_LITE } from '@/lib/tribe/models'
import { loadPreferences, savePreferences } from '@/lib/tribe/preferences'
import { countUnreadMessages } from '@/lib/tribe/chats'
import { contactEmail, hasVerifiedEmail } from '@/lib/auth/phone-login'
import { deleteAccount } from '@/lib/account/delete-account'
import { screenText } from '@/lib/moderation/screen'

async function me(req: Request) {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [{ data: p }, { data: priv }, prefs, unreadN, unreadMessages] = await Promise.all([
    ctx.db.from('profiles').select(`${PROFILE_LITE}, role, bio, date_of_birth, phone_number, status_text, status_visibility, location, instagram_url, website_url, username_changed_at, trips_private, states_private, phone_public`).eq('id', user.id).single(),
    ctx.db.from('profile_private').select('gender, home_city, emergency_name, emergency_phone').eq('user_id', user.id).maybeSingle(),
    loadPreferences(ctx.db, user.id),
    ctx.db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
    countUnreadMessages(ctx.db, user.id),
  ])
  const role = (p?.role as string) ?? 'user'
  return {
    user: {
      ...toUserLite(p), email: contactEmail(user.email) || null, phone: (p?.phone_number as string | null) ?? null,
      gender: (priv?.gender as string | null) ?? null, homeCity: (priv?.home_city as string | null) ?? null,
      bio: (p?.bio as string | null) ?? null, dateOfBirth: (p?.date_of_birth as string | null) ?? null,
      statusText: (p?.status_text as string | null) ?? null, statusVisibility: (p?.status_visibility as string | null) ?? 'public',
      location: (p?.location as string | null) ?? null,
      instagram: ((p?.instagram_url as string | null) ?? '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || null,
      website: (p?.website_url as string | null) ?? null,
      /** When you can next change your username (40 days after the last change); null = now. */
      usernameChangeAfter: usernameChangeAfter(p?.username_changed_at as string | null),
      /** Told by SMS when you raise an SOS on a trip. Only you see it. */
      emergencyName: (priv?.emergency_name as string | null) ?? null, emergencyPhone: (priv?.emergency_phone as string | null) ?? null,
      tripsPrivate: p?.trips_private === true, statesPrivate: p?.states_private === true, phonePublic: p?.phone_public === true,
    },
    role,
    isStaff: role !== 'user',
    /** A confirmed email or a verified phone: enough to post, comment, vote and join plans. */
    canParticipate: hasVerifiedEmail(user) || p?.is_phone_verified === true,
    preferences: prefs,
    counts: { unreadNotifications: unreadN.count ?? 0, unreadMessages },
  }
}

export const GET = route(async (req: Request) => ok(await me(req)))

const USERNAME_COOLDOWN_MS = 40 * 86_400_000
function usernameChangeAfter(changedAt: string | null | undefined): string | null {
  if (!changedAt) return null
  const t = new Date(changedAt).getTime() + USERNAME_COOLDOWN_MS
  return t > Date.now() ? new Date(t).toISOString() : null
}

const Patch = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Use 3–30 letters, numbers or _').optional(),
  location: z.string().trim().max(80).nullable().optional(),
  /** Just the handle; "@" and a pasted instagram.com link are fine too. */
  instagram: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(200).nullable().optional(),
  /** A photo uploaded first via /uploads (purpose avatar). */
  avatarUrl: z.string().url().max(600).nullable().optional(),
  tripsPrivate: z.boolean().optional(),
  statesPrivate: z.boolean().optional(),
  phonePublic: z.boolean().optional(),
  emergencyName: z.string().trim().max(80).nullable().optional(),
  /** Indian mobile, 10 digits (a +91 prefix is fine); empty clears it. */
  emergencyPhone: z.string().trim().max(20).nullable().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  gender: z.enum(['woman', 'man', 'nonbinary', 'prefer_not']).nullable().optional(),
  homeCity: z.string().trim().max(80).nullable().optional(),
  homeLat: z.number().min(-90).max(90).nullable().optional(),
  homeLng: z.number().min(-180).max(180).nullable().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** The status line on your profile ("Off to Spiti next week"); empty clears it. */
  statusText: z.string().trim().max(140).nullable().optional(),
  statusVisibility: z.enum(['public', 'followers']).optional(),
}).strict()

export const PATCH = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Patch)
  if (b.dateOfBirth) {
    const age = (Date.now() - new Date(b.dateOfBirth).getTime()) / (365.25 * 86400_000)
    if (!(age >= 18 && age < 120)) throw new ApiError('bad_request', 'UnSOLO is for travellers 18 and over', { field: 'dateOfBirth' })
  }
  // Public profile fields
  const pub: Record<string, unknown> = {}
  if (b.name !== undefined) pub.full_name = b.name
  if (b.bio !== undefined) pub.bio = b.bio
  if (b.dateOfBirth !== undefined) pub.date_of_birth = b.dateOfBirth
  if (b.statusText !== undefined) {
    if (b.statusText && screenText(b.statusText).hold) throw new ApiError('bad_request', 'That status can’t be shown. Please keep it kind and safe.', { field: 'statusText' })
    pub.status_text = b.statusText || null
  }
  if (b.statusVisibility !== undefined) pub.status_visibility = b.statusVisibility
  if (b.location !== undefined) pub.location = b.location || null
  if (b.instagram !== undefined) {
    const h = (b.instagram ?? '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '')
    if (h && !/^[a-zA-Z0-9._]{1,30}$/.test(h)) throw new ApiError('bad_request', 'Use just your Instagram username: letters, numbers, . and _', { field: 'instagram' })
    pub.instagram_url = h ? `https://instagram.com/${h}` : null
  }
  if (b.website !== undefined) {
    let w = b.website || null
    if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`
    if (w) { try { new URL(w) } catch { throw new ApiError('bad_request', 'That doesn’t look like a web address', { field: 'website' }) } }
    pub.website_url = w
  }
  if (b.avatarUrl !== undefined) {
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`
    if (b.avatarUrl && !b.avatarUrl.startsWith(base)) throw new ApiError('bad_request', 'Upload the photo first', { field: 'avatarUrl' })
    pub.avatar_url = b.avatarUrl
  }
  if (b.tripsPrivate !== undefined) pub.trips_private = b.tripsPrivate
  if (b.statesPrivate !== undefined) pub.states_private = b.statesPrivate
  if (b.phonePublic !== undefined) pub.phone_public = b.phonePublic
  if (b.username !== undefined) {
    const { data: cur } = await ctx.db.from('profiles').select('username, username_changed_at').eq('id', user.id).single()
    if (cur && String(cur.username).toLowerCase() !== b.username.toLowerCase()) {
      const after = usernameChangeAfter(cur.username_changed_at as string | null)
      if (after) throw new ApiError('conflict', `You can change your username again on ${new Date(after).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, { field: 'username' })
      const { data: taken } = await ctx.service().from('profiles').select('id').ilike('username', b.username.replace(/_/g, '\\_')).neq('id', user.id).maybeSingle()
      if (taken) throw new ApiError('conflict', 'That username is taken', { field: 'username' })
      pub.username = b.username
      pub.username_changed_at = new Date().toISOString()
    }
  }
  if (Object.keys(pub).length) {
    const { error } = await ctx.db.from('profiles').update({ ...pub, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (error) throw error
  }
  // Private fields (owner-only table). Gender is locked once ID-verified (DB trigger).
  const priv: Record<string, unknown> = {}
  if (b.gender !== undefined) {
    const { data: prof } = await ctx.db.from('profiles').select('is_id_verified').eq('id', user.id).single()
    const { data: cur } = await ctx.db.from('profile_private').select('gender').eq('user_id', user.id).maybeSingle()
    if (prof?.is_id_verified && (cur?.gender ?? null) !== b.gender) {
      throw new ApiError('forbidden', 'Your gender comes from your verified ID. Contact support to change it.', { field: 'gender' })
    }
    priv.gender = b.gender
  }
  if (b.homeCity !== undefined) priv.home_city = b.homeCity
  if (b.emergencyName !== undefined) priv.emergency_name = b.emergencyName || null
  if (b.emergencyPhone !== undefined) {
    const d = (b.emergencyPhone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
    if (d && !/^[6-9]\d{9}$/.test(d)) throw new ApiError('bad_request', 'Use a 10-digit Indian mobile number', { field: 'emergencyPhone' })
    priv.emergency_phone = d ? `+91${d}` : null
  }
  const round = (v: number | null | undefined) => (v == null ? v : Math.round(v * 100) / 100) // ~1 km: never store precise location
  const sharingLocation = b.homeLat != null && b.homeLng != null
  if (b.homeLat !== undefined) priv.home_lat = round(b.homeLat)
  if (b.homeLng !== undefined) priv.home_lng = round(b.homeLng)
  if (Object.keys(priv).length) {
    const { error } = await ctx.db.from('profile_private').upsert({ user_id: user.id, ...priv }, { onConflict: 'user_id' })
    if (error) throw error
  }
  // Sending a location is the consent; stopping sharing (Settings) clears it again.
  if (sharingLocation) await savePreferences(ctx.db, user.id, { shareLocation: true })
  return ok(await me(req))
})

/**
 * Delete my account. Body `{ "confirm": "DELETE" }` so a stray request can't do it.
 * Bookings and payments stay for the records with personal details removed; see lib/account/delete-account.
 */
export const DELETE = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await parseJson(req, z.object({ confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) }))
  const r = await deleteAccount(ctx.service(), user.id)
  if (!r.ok) throw new ApiError(r.code === 'server_error' ? 'server_error' : 'conflict', r.error)
  return ok({ deleted: true, mode: r.mode })
})
