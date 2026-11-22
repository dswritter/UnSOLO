import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseWith, route, uuid } from '@/lib/api/http'
import { getSupportWhatsappNumber } from '@/lib/platform-settings'
import { PACKAGE_LITE, PROFILE_LITE, toTripLite, toUserLite } from '@/lib/tribe/models'
import { tripEndDate } from '@/lib/trips/tripDays'

type Ctx = { params: Promise<{ bookingId: string }> }
type Row = Record<string, unknown>

/** Numbers that work anywhere in India, kept in every pack. */
const HELPLINES = [
  { label: 'Emergency (police, fire, ambulance)', phone: '112' },
  { label: 'Women helpline', phone: '181' },
  { label: 'Tourist helpline', phone: '1363' },
  { label: 'Ambulance', phone: '108' },
]

/**
 * GET /my/trips/{bookingId}/pack: everything for a trip in one go, to keep on the phone for places
 * with no signal: the plan (description, what's included, timings), your booking, the host's contact,
 * who else is going, the group chat, and helplines.
 */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).bookingId)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { data: b } = await ctx.db.from('bookings')
    .select(`id, status, travel_date, guests, total_amount_paise, deposit_paise, confirmation_code, special_requests, package_id, package:packages(${PACKAGE_LITE}, description, includes, departure_time, return_time, cancellation_policy)`)
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!b?.package_id || !b.package) throw new ApiError('not_found', 'Trip not found')
  const p = b.package as unknown as Row
  const svc = ctx.service()
  const start = String(b.travel_date ?? '')
  const [host, mates, room, support] = await Promise.all([
    p.host_id ? svc.from('profiles').select(`${PROFILE_LITE}, phone_number`).eq('id', p.host_id).maybeSingle() : Promise.resolve({ data: null }),
    svc.from('bookings').select(`guests, user:profiles!bookings_user_id_fkey(${PROFILE_LITE})`).eq('package_id', b.package_id).eq('travel_date', start).in('status', ['confirmed', 'completed']).neq('user_id', user.id).limit(40),
    svc.from('chat_rooms').select('id').eq('type', 'trip').eq('package_id', b.package_id).maybeSingle(),
    getSupportWhatsappNumber(),
  ])
  const total = Number(b.total_amount_paise ?? 0), deposit = Number(b.deposit_paise ?? 0)
  const paid = deposit > 0 ? deposit : b.status === 'confirmed' || b.status === 'completed' ? total : 0
  const h = host.data as Row | null
  return ok({
    bookingId: b.id,
    status: b.status,
    confirmationCode: b.confirmation_code ?? null,
    guests: Number(b.guests ?? 1),
    startDate: start,
    endDate: tripEndDate(start, Number(p.duration_days ?? 1)),
    departureTime: (p.departure_time as string | null) ?? null,
    returnTime: (p.return_time as string | null) ?? null,
    totalPaise: total, paidPaise: paid, balancePaise: Math.max(total - paid, 0),
    specialRequests: (b.special_requests as string | null) ?? null,
    trip: toTripLite(p),
    description: String(p.description ?? ''),
    includes: (p.includes as string[] | null) ?? [],
    cancellationPolicy: (p.cancellation_policy as string | null) ?? null,
    host: h ? { user: toUserLite(h), phone: (h.phone_number as string | null) ?? null } : null,
    travellers: ((mates.data ?? []) as Row[]).map((m) => toUserLite(m.user as Row)).filter((u) => u.id),
    chatRoomId: (room.data as Row | null)?.id ?? null,
    support: { whatsapp: support, email: 'hello@unsolo.in' },
    helplines: HELPLINES,
    generatedAt: new Date().toISOString(),
  }, { cache: 'private', req })
})
