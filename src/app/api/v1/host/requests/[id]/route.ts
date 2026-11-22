import { after } from 'next/server'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { getEmailFromAuthUser } from '@/lib/auth-email'
import { contactEmail } from '@/lib/auth/phone-login'
import { APP_URL, JOIN_PAYMENT_DEADLINE_HOURS } from '@/lib/constants'
import { sendJoinRequestApprovedEmail, sendJoinRequestRejectedEmail } from '@/lib/resend/emails'
import { hostDisplayName } from '@/lib/host/server'
import { JOIN_REQUEST_SELECT, toJoinRequest } from '@/lib/host/shape'
import { notify } from '@/lib/trips/safety'

type Row = Record<string, unknown>
type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(300, 'Keep the reason under 300 characters').nullish(),
})

/**
 * PUT /host/requests/{id}: approve or decline a pending join request on your trip. The traveller gets
 * a notification and an email (same copy as the web).
 */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)

  const { data: request, error } = await ctx.db.from('join_requests')
    .select('id, trip_id, user_id, status, trip:packages(host_id, title, slug, archived_at)')
    .eq('id', id).maybeSingle()
  if (error) throw error
  const trip = (Array.isArray(request?.trip) ? request?.trip[0] : request?.trip) as Row | null | undefined
  if (!request || !trip || trip.host_id !== user.id || trip.archived_at) throw new ApiError('not_found', 'Request not found')
  if (request.status !== 'pending') throw new ApiError('conflict', `This request is already ${request.status}`)

  const now = new Date()
  const reason = b.reason || null
  const deadline = new Date(now.getTime() + JOIN_PAYMENT_DEADLINE_HOURS * 3600_000).toISOString()
  const update = b.decision === 'approve'
    ? { status: 'approved', payment_deadline: deadline, updated_at: now.toISOString() }
    : { status: 'rejected', host_response: reason, updated_at: now.toISOString() }
  // Only from pending, so two taps (or two hosts' devices) can't decide twice.
  const { data: changed, error: updateError } = await ctx.db.from('join_requests').update(update).eq('id', id).eq('status', 'pending').select('id')
  if (updateError) throw updateError
  if (!changed?.length) throw new ApiError('conflict', 'This request was already handled')

  const svc = ctx.service()
  const travellerId = String(request.user_id)
  const tripTitle = String(trip.title ?? 'your trip')
  const tripSlug = String(trip.slug ?? '')
  const hostName = b.decision === 'approve' ? await hostDisplayName(ctx.db, user.id) : ''

  if (b.decision === 'approve') {
    await notify(svc, [travellerId], {
      type: 'group_invite',
      title: 'Request Approved!',
      body: `${hostName} approved your request to join "${tripTitle}". Complete payment within ${JOIN_PAYMENT_DEADLINE_HOURS} hours.`,
      link: `/packages/${tripSlug}`,
    })
  } else {
    await notify(svc, [travellerId], {
      type: 'booking',
      title: 'Join Request Update',
      body: reason
        ? `Your request to join "${tripTitle}" was not approved. Reason: ${reason}`
        : `Your request to join "${tripTitle}" was not approved.`,
      link: '/?search=1',
    })
  }

  // Email after the response; a mail failure never undoes the decision.
  after(async () => {
    try {
      const [{ data: auth }, { data: profile }] = await Promise.all([
        svc.auth.admin.getUserById(travellerId),
        svc.from('profiles').select('full_name, username').eq('id', travellerId).maybeSingle(),
      ])
      const email = contactEmail(getEmailFromAuthUser(auth?.user))
      if (!email) return
      const name = String(profile?.full_name || profile?.username || '').trim() || null
      const base = APP_URL.replace(/\/$/, '')
      if (b.decision === 'approve') {
        await sendJoinRequestApprovedEmail({
          travelerEmail: email,
          travelerName: name,
          hostName,
          tripTitle,
          packageUrl: `${base}/packages/${tripSlug}`,
          paymentDeadlineHours: JOIN_PAYMENT_DEADLINE_HOURS,
          paymentDeadlineLabel: new Date(deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        })
      } else {
        await sendJoinRequestRejectedEmail({ to: email, travelerName: name ?? '', tripTitle, reason: reason || undefined, exploreUrl: `${base}/?search=1` })
      }
    } catch (e) {
      console.error('[api/v1/host] join request email failed', (e as Error)?.message)
    }
  })

  const { data: row, error: rowError } = await ctx.db.from('join_requests').select(JOIN_REQUEST_SELECT).eq('id', id).single()
  if (rowError) throw rowError
  const { data: score } = await ctx.db.from('leaderboard_scores').select('trips_completed, total_score').eq('user_id', travellerId).maybeSingle()
  return ok(toJoinRequest(row as Row, score))
})
