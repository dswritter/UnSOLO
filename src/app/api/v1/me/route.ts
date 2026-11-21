import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { toUserLite, PROFILE_LITE } from '@/lib/tribe/models'
import { loadPreferences, savePreferences } from '@/lib/tribe/preferences'
import { countUnreadMessages } from '@/lib/tribe/chats'
import { contactEmail } from '@/lib/auth/phone-login'

async function me(req: Request) {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [{ data: p }, { data: priv }, prefs, unreadN, unreadMessages] = await Promise.all([
    ctx.db.from('profiles').select(`${PROFILE_LITE}, role, bio, date_of_birth, phone_number`).eq('id', user.id).single(),
    ctx.db.from('profile_private').select('gender, home_city').eq('user_id', user.id).maybeSingle(),
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
    },
    role,
    isStaff: role !== 'user',
    preferences: prefs,
    counts: { unreadNotifications: unreadN.count ?? 0, unreadMessages },
  }
}

export const GET = route(async (req: Request) => ok(await me(req)))

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  gender: z.enum(['woman', 'man', 'nonbinary', 'prefer_not']).nullable().optional(),
  homeCity: z.string().trim().max(80).nullable().optional(),
  homeLat: z.number().min(-90).max(90).nullable().optional(),
  homeLng: z.number().min(-180).max(180).nullable().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
