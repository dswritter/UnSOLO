'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { splitRefundPaise } from '@/lib/community-payment'
import {
  REFUND_TIER_SETTING_KEYS,
  currentRefundPercent,
  defaultTiersFor,
  parseRefundTiersJson,
  resolveRefundCategory,
  type RefundTierCategory,
} from '@/lib/refund-tiers'

type BookingCore = {
  id: string
  total_amount_paise: number
  gross_paise: number | null
  travel_date: string | null
  check_in_date: string | null
  package_id: string | null
  service_listing_id: string | null
  booking_type: string | null
  package?: { host_id: string | null } | null
  service_listing?: { type: string | null } | null
}

type HostEarningCore = {
  id: string
  host_paise: number
  platform_fee_paise: number
  released_paise: number | null
} | null

export type CancellationQuote = {
  bookingId: string
  category: RefundTierCategory
  tierPercent: number
  travelDateIso: string | null
  /** True when the booking has no host_earnings row (e.g. UnSOLO-owned, not community). */
  platformOnly: boolean
  totalRefundPaise: number
  hostRefundPaise: number
  platformRefundPaise: number
  hostPaise: number
  platformPaise: number
  alreadyReleasedPaise: number
  hostClawbackPaise: number
  platformWriteOffPaise: number
}

async function loadTiers(category: RefundTierCategory) {
  const svc = await createServiceClient()
  const key = REFUND_TIER_SETTING_KEYS[category]
  const { data } = await svc.from('platform_settings').select('value').eq('key', key).maybeSingle()
  return parseRefundTiersJson((data?.value as string | null) ?? null, defaultTiersFor(category))
}

/**
 * Pure preview — does NOT mutate anything. Admin UI calls this to show the
 * projected refund split before confirming a cancellation.
 */
export async function quoteCancellationRefund(
  bookingId: string,
  overrideTierPercent?: number,
): Promise<CancellationQuote | { error: string }> {
  const svc = await createServiceClient()
  const { data: booking } = (await svc
    .from('bookings')
    .select(
      'id, total_amount_paise, gross_paise, travel_date, check_in_date, package_id, service_listing_id, booking_type, package:packages(host_id), service_listing:service_listings(type)',
    )
    .eq('id', bookingId)
    .single()) as unknown as { data: BookingCore | null }
  if (!booking) return { error: 'Booking not found' }

  const category = resolveRefundCategory({
    serviceListingType: booking.service_listing?.type || null,
    packageHostId: booking.package?.host_id || null,
    isServiceListing: booking.booking_type === 'service' || !!booking.service_listing_id,
  })

  const tiers = await loadTiers(category)
  const travelDateIso = booking.travel_date ?? booking.check_in_date ?? null
  const tierPercent = Number.isFinite(overrideTierPercent as number)
    ? Math.max(0, Math.min(100, overrideTierPercent as number))
    : currentRefundPercent(travelDateIso, tiers)

  const { data: earning } = (await svc
    .from('host_earnings')
    .select('id, host_paise, platform_fee_paise, released_paise')
    .eq('booking_id', bookingId)
    .maybeSingle()) as unknown as { data: HostEarningCore }

  if (earning) {
    const split = splitRefundPaise({
      hostPaise: earning.host_paise,
      platformPaise: earning.platform_fee_paise,
      tierPercent,
      alreadyReleasedPaise: earning.released_paise ?? 0,
    })
    return {
      bookingId,
      category,
      tierPercent,
      travelDateIso,
      platformOnly: false,
      totalRefundPaise: split.totalRefundPaise,
      hostRefundPaise: split.hostRefundPaise,
      platformRefundPaise: split.platformRefundPaise,
      hostPaise: earning.host_paise,
      platformPaise: earning.platform_fee_paise,
      alreadyReleasedPaise: earning.released_paise ?? 0,
      hostClawbackPaise: split.hostClawbackPaise,
      platformWriteOffPaise: split.platformWriteOffPaise,
    }
  }

  // No host_earnings row → UnSOLO-owned trip. Platform absorbs the refund alone.
  const gross = booking.gross_paise ?? booking.total_amount_paise ?? 0
  const total = Math.round(gross * (tierPercent / 100))
  return {
    bookingId,
    category,
    tierPercent,
    travelDateIso,
    platformOnly: true,
    totalRefundPaise: total,
    hostRefundPaise: 0,
    platformRefundPaise: total,
    hostPaise: 0,
    platformPaise: gross,
    alreadyReleasedPaise: 0,
    hostClawbackPaise: 0,
    platformWriteOffPaise: 0,
  }
}

/**
 * Write the cancellation split to host_earnings when approving a cancellation.
 * Safe to call even if no host_earnings row exists (e.g. UnSOLO-owned booking).
 */
export async function applyRefundSplitToEarning(
  bookingId: string,
  tierPercent: number,
  refundPaise: number,
): Promise<{ ok: true; split?: CancellationQuote } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }

  const quote = await quoteCancellationRefund(bookingId, tierPercent)
  if ('error' in quote) return { ok: false, error: quote.error }

  const svc = await createServiceClient()

  // Scale the split to the *actual* refund being paid out — admin may have
  // overridden the tier amount (e.g. goodwill refund). Preserve the pro-rata
  // ratio from the quote.
  let hostRefundPaise = quote.hostRefundPaise
  let platformRefundPaise = quote.platformRefundPaise
  if (!quote.platformOnly && quote.totalRefundPaise > 0 && refundPaise !== quote.totalRefundPaise) {
    const scale = refundPaise / quote.totalRefundPaise
    hostRefundPaise = Math.round(quote.hostRefundPaise * scale)
    platformRefundPaise = refundPaise - hostRefundPaise
  } else if (quote.platformOnly) {
    hostRefundPaise = 0
    platformRefundPaise = refundPaise
  }

  // Re-compute claw-back at the scaled amount.
  const scaledSplit = splitRefundPaise({
    hostPaise: quote.hostPaise,
    platformPaise: quote.platformPaise,
    tierPercent: quote.hostPaise > 0 ? (hostRefundPaise / quote.hostPaise) * 100 : 0,
    alreadyReleasedPaise: quote.alreadyReleasedPaise,
  })

  const { data: earning } = await svc
    .from('host_earnings')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (earning) {
    await svc
      .from('host_earnings')
      .update({
        host_refund_paise: hostRefundPaise,
        platform_refund_paise: platformRefundPaise,
        platform_writeoff_paise: scaledSplit.platformWriteOffPaise,
        refund_tier_percent: Math.round(tierPercent),
        cancelled_at: new Date().toISOString(),
        // If host had unreleased balance ≥ clawback, reduce host_paise accordingly
        // so future payouts see the correct remaining owed amount.
        host_paise: Math.max(0, quote.hostPaise - scaledSplit.hostClawbackPaise),
        payout_status: 'cancelled',
      })
      .eq('id', earning.id)
  }

  return { ok: true, split: { ...quote, hostRefundPaise, platformRefundPaise, totalRefundPaise: refundPaise } }
}
