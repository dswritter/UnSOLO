import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'

type Ctx = { params: Promise<{ roomId: string }> }
type Row = Record<string, unknown>
const uuid = z.string().uuid()

async function assertMember(ctx: Awaited<ReturnType<typeof getApiContext>>, roomId: string, userId: string) {
  const { data } = await ctx.db.from('chat_room_members').select('id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
  if (!data) throw new ApiError('forbidden', 'Only people in this group can see live locations')
}

/** GET /chats/{roomId}/live-location: who in the group is sharing right now, with their last position. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await assertMember(ctx, roomId, user.id)
  const { data, error } = await ctx.db.from('live_locations')
    .select(`user_id, lat, lng, accuracy_m, started_at, updated_at, expires_at, user:profiles!live_locations_user_id_fkey(${PROFILE_LITE})`)
    .eq('room_id', roomId).gt('expires_at', new Date().toISOString()).order('updated_at', { ascending: false })
  if (error) throw error
  return ok({
    items: ((data ?? []) as Row[]).map((r) => ({
      user: toUserLite(r.user as Row), lat: Number(r.lat), lng: Number(r.lng), accuracy: r.accuracy_m == null ? null : Number(r.accuracy_m),
      startedAt: r.started_at, updatedAt: r.updated_at, expiresAt: r.expires_at, mine: r.user_id === user.id,
    })),
  }, { cache: 'private', req })
})

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  /** Only when starting: how long to share (15 min to 8 hours). Updates keep the end time. */
  minutes: z.number().int().min(15).max(480).optional(),
})

/** PUT /chats/{roomId}/live-location: start sharing (with minutes) or send a newer position. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  await assertMember(ctx, roomId, user.id)
  await enforceRateLimit(ctx, 'location')
  const now = new Date()
  const { data: cur } = await ctx.db.from('live_locations').select('expires_at, started_at').eq('room_id', roomId).eq('user_id', user.id).maybeSingle()
  const live = cur && new Date(String(cur.expires_at)) > now
  if (!live && !b.minutes) throw new ApiError('bad_request', 'Choose how long to share', { field: 'minutes' })
  const expires = b.minutes ? new Date(now.getTime() + b.minutes * 60_000).toISOString() : String(cur!.expires_at)
  const row = { user_id: user.id, room_id: roomId, lat: b.lat, lng: b.lng, accuracy_m: b.accuracy ?? null, updated_at: now.toISOString(), expires_at: expires,
    started_at: live && !b.minutes ? String(cur!.started_at) : now.toISOString() }
  const { error } = await ctx.db.from('live_locations').upsert(row, { onConflict: 'user_id,room_id' })
  if (error) throw error
  // Starting: one line in the group so people know to look.
  if (b.minutes && !live) {
    const h = b.minutes >= 60 ? `${Math.round(b.minutes / 60)} h` : `${b.minutes} min`
    await ctx.db.from('messages').insert({ room_id: roomId, user_id: user.id, content: `📍 Sharing my live location for ${h}. Open the group's map to see it.`, message_type: 'text' })
  }
  return ok({ expiresAt: expires })
})

/** DELETE /chats/{roomId}/live-location: stop sharing now. */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const roomId = parseWith(uuid, (await params).roomId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await ctx.db.from('live_locations').delete().eq('room_id', roomId).eq('user_id', user.id)
  return ok({ stopped: true })
})
