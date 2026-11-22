import { after } from 'next/server'
import { z } from 'zod'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getSupportWhatsappNumber } from '@/lib/platform-settings'
import { currentTrips } from '@/lib/trips/current'
import { emailSos, mapLink, notify, sendSosSms, staffIds } from '@/lib/trips/safety'

type Row = Record<string, unknown>

const Body = z.object({
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
})

/** GET /sos: whether you're on a trip today (the app shows the SOS button then) and who would be told. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [trips, { data: priv }, support] = await Promise.all([
    currentTrips(ctx.db, user.id),
    ctx.db.from('profile_private').select('emergency_name, emergency_phone').eq('user_id', user.id).maybeSingle(),
    getSupportWhatsappNumber(),
  ])
  return ok({
    onTrip: trips.length > 0,
    trips: trips.map((t) => ({ bookingId: t.bookingId, title: t.title, slug: t.slug, start: t.start, end: t.end })),
    emergencyContact: priv?.emergency_phone ? { name: (priv.emergency_name as string | null) ?? null, phone: String(priv.emergency_phone) } : null,
    supportWhatsapp: support,
  }, { cache: 'private', req })
})

/**
 * POST /sos: raise an alert. Stores it, then tells the UnSOLO team (notification + email), the host
 * (notification, and SMS when the SOS template is set up) and your emergency contact (SMS when set
 * up). Returns numbers the phone can call or message directly, which always works.
 */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  await enforceRateLimit(ctx, 'sos')
  const svc = ctx.service()
  const trips = await currentTrips(svc, user.id)
  const trip = (b.bookingId ? trips.find((t) => t.bookingId === b.bookingId) : null) ?? trips[0] ?? null
  const [{ data: me }, { data: priv }, support] = await Promise.all([
    svc.from('profiles').select('full_name, username, phone_number').eq('id', user.id).single(),
    svc.from('profile_private').select('emergency_name, emergency_phone').eq('user_id', user.id).maybeSingle(),
    getSupportWhatsappNumber(),
  ])
  const host = trip?.hostId ? (await svc.from('profiles').select('id, full_name, phone_number').eq('id', trip.hostId).maybeSingle()).data as Row | null : null
  const name = String((me as Row | null)?.full_name || (me as Row | null)?.username || 'A traveller')
  const map = mapLink(b.lat, b.lng)
  const { data: alert, error } = await svc.from('sos_alerts').insert({
    user_id: user.id, booking_id: trip?.bookingId ?? null, package_id: trip?.packageId ?? null,
    lat: b.lat ?? null, lng: b.lng ?? null, accuracy_m: b.accuracy ?? null, note: b.note || null,
  }).select('id, created_at').single()
  if (error) throw error

  const title = `SOS: ${name} needs help`
  const body = [trip ? `On ${trip.title}.` : null, map ? `Location: ${map}` : 'No location shared.', b.note || null].filter(Boolean).join(' ')
  const notified: Record<string, string> = {}
  const tasks: Promise<unknown>[] = []
  const staff = await staffIds(svc)
  tasks.push(notify(svc, staff, { type: 'sos', title, body, link: '/admin', metadata: { sos_id: alert.id, actor_id: user.id } }).then(() => { notified.team = `${staff.length} notified` }))
  tasks.push(emailSos({ name, username: String((me as Row | null)?.username ?? ''), phone: ((me as Row | null)?.phone_number as string | null) ?? null, trip: trip?.title ?? null, map, note: b.note || null, at: String(alert.created_at) })
    .then(() => { notified.email = 'sent' }, () => { notified.email = 'failed' }))
  if (host?.id) {
    tasks.push(notify(svc, [String(host.id)], { type: 'sos', title, body, link: `/profile/${(me as Row | null)?.username ?? ''}`, metadata: { sos_id: alert.id, actor_id: user.id } }).then(() => { notified.host = 'notified' }))
    if (host.phone_number) tasks.push(sendSosSms(String(host.phone_number), [name, trip?.title ?? 'trip', map ?? 'unsolo.in']).then((r) => { notified.hostSms = r }))
  }
  if (priv?.emergency_phone) tasks.push(sendSosSms(String(priv.emergency_phone), [name, trip?.title ?? 'trip', map ?? 'unsolo.in']).then((r) => { notified.emergencySms = r }))
  await Promise.allSettled(tasks)
  await svc.from('sos_alerts').update({ notified }).eq('id', alert.id)
  // Push now, not on the next sweep.
  after(() => dispatchPendingPushes({ limit: 100 }).then(() => undefined))

  return ok({
    id: alert.id,
    notified,
    trip: trip ? { title: trip.title, slug: trip.slug } : null,
    host: host ? { name: String(host.full_name ?? 'Your host'), phone: (host.phone_number as string | null) ?? null } : null,
    emergencyContact: priv?.emergency_phone ? { name: (priv.emergency_name as string | null) ?? null, phone: String(priv.emergency_phone) } : null,
    supportWhatsapp: support,
    message: `SOS from ${name}${trip ? ` on ${trip.title}` : ''}. ${map ? `I'm here: ${map}` : ''} Please call me.`.replace(/\s+/g, ' ').trim(),
  }, { status: 201 })
})
