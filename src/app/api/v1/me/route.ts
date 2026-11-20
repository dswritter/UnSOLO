import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { toUserLite, PROFILE_LITE } from '@/lib/tribe/models'
import { loadPreferences } from '@/lib/tribe/preferences'
import { countUnreadMessages } from '@/lib/tribe/chats'

async function me(req: Request) {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [{ data: p }, prefs, unreadN, unreadMessages] = await Promise.all([
    ctx.db.from('profiles').select(`${PROFILE_LITE}, role, gender, home_city, bio, date_of_birth, phone_number`).eq('id', user.id).single(),
    loadPreferences(ctx.db, user.id),
    ctx.db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
    countUnreadMessages(ctx.db, user.id),
  ])
  const role = (p?.role as string) ?? 'user'
  return {
    user: {
      ...toUserLite(p), email: user.email ?? null, phone: (p?.phone_number as string | null) ?? null,
      gender: (p?.gender as string | null) ?? null, homeCity: (p?.home_city as string | null) ?? null,
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
    if (!(age >= 18 && age < 120)) {
      const { ApiError } = await import('@/lib/api/http')
      throw new ApiError('bad_request', 'UnSOLO is for travellers 18 and over', { field: 'dateOfBirth' })
    }
  }
  const round = (v: number | null | undefined) => (v == null ? v : Math.round(v * 100) / 100) // ~1 km: never store precise location
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.name !== undefined) update.full_name = b.name
  if (b.bio !== undefined) update.bio = b.bio
  if (b.gender !== undefined) update.gender = b.gender
  if (b.homeCity !== undefined) update.home_city = b.homeCity
  if (b.homeLat !== undefined) update.home_lat = round(b.homeLat)
  if (b.homeLng !== undefined) update.home_lng = round(b.homeLng)
  if (b.dateOfBirth !== undefined) update.date_of_birth = b.dateOfBirth
  const { error } = await ctx.db.from('profiles').update(update).eq('id', user.id)
  if (error) throw error
  return ok(await me(req))
})
