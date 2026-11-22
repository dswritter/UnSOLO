import { getApiContext } from '@/lib/api/context'
import { z } from 'zod'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { PAYOUT_COLUMNS, hostDisplayName, notifyAdmins, platformMaxGroupSize, requireHost, revalidateTripPages, storagePrefix } from '@/lib/host/server'
import { isPayoutConfigured } from '@/lib/host/shape'
import { tripFormToRow, tripSlug, validateTripForm } from '@/lib/host/trip-form'
import { todayIST } from '@/lib/tribe/models'

/**
 * POST /host/trips: submit a new trip for review. Same as the web `createHostedTrip` (pending,
 * hidden, admins notified, phone made public), with the TripForm checked here.
 */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireHost(ctx)
  const raw = await parseJson(req, z.unknown())

  const { data: payout, error } = await ctx.db.from('profiles').select(PAYOUT_COLUMNS).eq('id', user.id).single()
  if (error) throw error
  if (!isPayoutConfigured(payout)) {
    throw new ApiError('conflict', 'Add a UPI ID or bank account before publishing a trip', { field: 'payout' })
  }

  const svc = ctx.service()
  const form = validateTripForm(raw, { today: todayIST(), maxGroupSize: await platformMaxGroupSize(svc), storagePrefix: storagePrefix() })
  const { data: dest } = await ctx.db.from('destinations').select('id').eq('id', form.destinationId).maybeSingle()
  if (!dest) throw new ApiError('bad_request', 'Choose a destination', { field: 'destinationId' })

  await enforceRateLimit(ctx, 'post', `trip:${user.id}`)
  const row = {
    ...tripFormToRow(form),
    slug: tripSlug(form.title),
    host_id: user.id,
    moderation_status: 'pending',
    is_active: false,
  }
  const { data: trip, error: insertError } = await ctx.db.from('packages').insert(row).select('id, slug, moderation_status').single()
  if (insertError) throw insertError
  revalidateTripPages(String(trip.id), trip.slug)

  const hostName = await hostDisplayName(ctx.db, user.id)
  await notifyAdmins(svc, { title: 'New Community Trip for Review', body: `${hostName} submitted "${form.title}" for moderation.` })
  await ctx.db.from('profiles').update({ phone_public: true }).eq('id', user.id)

  return ok({ id: trip.id, slug: trip.slug, moderationStatus: trip.moderation_status ?? 'pending' }, { status: 201 })
})
