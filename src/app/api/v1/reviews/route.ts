import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { screenText } from '@/lib/moderation/screen'
import { todayIST } from '@/lib/tribe/models'
import { syncReviewStatsForUser } from '@/lib/travel/refreshTravelStats'
import { tripEndDate } from '@/lib/trips/tripDays'

type Row = Record<string, unknown>

const Body = z.object({
  bookingId: z.string().uuid(),
  /** Overall is the average of the two, like the web. */
  ratingDestination: z.number().int().min(1).max(5),
  ratingExperience: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(3000).optional(),
  /** Up to 6 photos, uploaded first via /uploads (purpose review). */
  photos: z.array(z.string().url().max(600)).max(6).default([]),
})

/**
 * POST /reviews: review a trip you went on (once it has ended), with photos. One per booking.
 */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, Body)
  await enforceRateLimit(ctx, 'post')
  const { data: bk } = await ctx.db.from('bookings').select('id, status, package_id, travel_date, package:packages(duration_days, title)')
    .eq('id', b.bookingId).eq('user_id', user.id).maybeSingle()
  if (!bk?.package_id) throw new ApiError('not_found', 'Booking not found')
  const ended = !!bk.travel_date && tripEndDate(String(bk.travel_date), Number((bk.package as unknown as Row | null)?.duration_days ?? 1)) < todayIST()
  if (!(bk.status === 'completed' || (bk.status === 'confirmed' && ended))) throw new ApiError('bad_request', 'You can review a trip once it’s over')
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`
  if (b.photos.some((u) => !u.startsWith(base))) throw new ApiError('bad_request', 'Upload the photos first', { field: 'photos' })
  for (const [field, text] of [['title', b.title], ['body', b.body]] as const) {
    if (text && screenText(text).hold) throw new ApiError('bad_request', 'Please keep it kind and about the trip.', { field })
  }
  const { data: existing } = await ctx.db.from('reviews').select('id').eq('booking_id', b.bookingId).maybeSingle()
  if (existing) throw new ApiError('conflict', 'You’ve already reviewed this trip')
  const { data, error } = await ctx.db.from('reviews').insert({
    booking_id: b.bookingId, user_id: user.id, package_id: bk.package_id,
    rating: Math.round((b.ratingDestination + b.ratingExperience) / 2), rating_destination: b.ratingDestination, rating_experience: b.ratingExperience,
    title: b.title || null, body: b.body || null, images: b.photos.length ? b.photos : null,
  }).select('id').single()
  if (error) throw error
  await syncReviewStatsForUser(ctx.service(), user.id).catch(() => undefined)
  return ok({ id: data.id }, { status: 201 })
})
