import { getApiContext } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { requireHost } from '@/lib/host/server'

type Row = Record<string, unknown>
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Row | null | undefined

/** GET /host/earnings: what you've earned per booking, newest first (at most 200), with totals. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireHost(ctx)
  const [{ data: all, error: totalsError }, { data, error }] = await Promise.all([
    ctx.db.from('host_earnings').select('host_paise, payout_status').eq('host_id', user.id),
    ctx.db.from('host_earnings')
      .select('booking_id, total_paise, platform_fee_paise, host_paise, payout_status, payout_date, payout_reference, created_at, booking:bookings(travel_date, package:packages(title))')
      .eq('host_id', user.id).order('created_at', { ascending: false }).limit(200),
  ])
  if (totalsError) throw totalsError
  if (error) throw error
  const rows = (all ?? []) as Row[]
  const sum = (xs: Row[]) => xs.reduce((n, e) => n + Number(e.host_paise ?? 0), 0)
  const earnedPaise = sum(rows)
  const paidPaise = sum(rows.filter((e) => e.payout_status === 'completed'))
  return ok({
    totals: { earnedPaise, pendingPaise: earnedPaise - paidPaise, paidPaise },
    items: ((data ?? []) as Row[]).map((e) => {
      const booking = one(e.booking)
      return {
        bookingId: (e.booking_id as string | null) ?? null,
        tripTitle: (one(booking?.package)?.title as string | undefined) ?? null,
        travelDate: (booking?.travel_date as string | null | undefined) ?? null,
        totalPaise: Number(e.total_paise ?? 0),
        platformFeePaise: Number(e.platform_fee_paise ?? 0),
        hostPaise: Number(e.host_paise ?? 0),
        payoutStatus: String(e.payout_status ?? 'pending'),
        payoutDate: (e.payout_date as string | null) ?? null,
        payoutReference: (e.payout_reference as string | null) ?? null,
      }
    }),
  })
})
