import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { PACKAGE_LITE, toTripLite, todayIST } from '@/lib/tribe/models'

export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [{ data: bookings, error }, { data: memberships }, { data: rooms }] = await Promise.all([
    ctx.db.from('bookings').select(`id, status, travel_date, guests, total_amount_paise, deposit_paise, confirmation_code, package_id, package:packages(${PACKAGE_LITE})`)
      .eq('user_id', user.id).in('status', ['pending', 'confirmed', 'completed']).order('travel_date', { ascending: true }),
    ctx.db.from('plan_members').select('post_id, state').eq('user_id', user.id).in('state', ['approved', 'requested']),
    ctx.db.from('chat_rooms').select('id, package_id').eq('type', 'trip'),
  ])
  if (error) throw error
  const roomFor = new Map((rooms ?? []).filter((r) => r.package_id).map((r) => [r.package_id as string, r.id as string]))
  const today = todayIST()
  const { data: myStories } = await ctx.db.from('posts').select('trip_package_id').eq('author_id', user.id).eq('kind', 'story')
  const storied = new Set((myStories ?? []).map((s) => s.trip_package_id as string))
  const shape = (b: Record<string, unknown>) => {
    const total = Number(b.total_amount_paise ?? 0)
    // Same rule as the web bookings page: token trips record deposit_paise; others are paid in full once confirmed.
    const deposit = Number(b.deposit_paise ?? 0)
    const paid = deposit > 0 ? deposit : b.status === 'confirmed' || b.status === 'completed' ? total : 0
    return {
      id: b.id, status: b.status, travelDate: b.travel_date, guests: b.guests ?? 1,
      totalPaise: total, paidPaise: paid, balancePaise: Math.max(total - paid, 0),
      confirmationCode: b.confirmation_code ?? null,
      trip: toTripLite(b.package as Record<string, unknown>), chatRoomId: roomFor.get(b.package_id as string) ?? null,
      storyPrompt: String(b.travel_date) < today && !storied.has(b.package_id as string),
    }
  }
  const all = (bookings ?? []) as Record<string, unknown>[]
  const viewer = await loadViewer(ctx.db, user)
  const approvedIds = (memberships ?? []).filter((m) => m.state === 'approved').map((m) => m.post_id as string)
  const requestedIds = (memberships ?? []).filter((m) => m.state === 'requested').map((m) => m.post_id as string)
  const [plans, requested] = await Promise.all([loadPosts(ctx.db, approvedIds, viewer), loadPosts(ctx.db, requestedIds, viewer)])
  return ok({
    upcoming: all.filter((b) => String(b.travel_date) >= today).map(shape),
    plans: plans.filter((p) => p.status === 'live'),
    requested,
    past: all.filter((b) => String(b.travel_date) < today).reverse().map(shape),
  })
})
