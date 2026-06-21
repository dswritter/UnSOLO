'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { splitRefundPaise } from '@/lib/community-payment'
import { computeGatewayFeeDeduction, type CapturedPayment } from '@/lib/refund-math'
import { loadGatewayFeeSettings } from '@/lib/refund-settings'
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
  deposit_paise: number | null
  cancellation_requested_at: string | null
  travel_date: string | null
  check_in_date: string | null
  package_id: string | null
  service_listing_id: string | null
  booking_type: string | null
  razorpay_payment_ids?: CapturedPayment[] | null
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
  /** Cash actually collected toward the booking (refund is capped at this). */
  amountPaidPaise: number
  /** Tier refund capped at amount paid, before gateway charges. */
  grossRefundPaise: number
  /** Non-refundable payment-gateway charge deducted from the refund. */
  gatewayFeePaise: number
  /** Final amount refunded to the customer = grossRefundPaise − gatewayFeePaise. */
  netRefundPaise: number
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
  opts?: { asOfIso?: string },
): Promise<CancellationQuote | { error: string }> {
  const svc = await createServiceClient()
  // select('*') so this is resilient to columns (deposit_paise, razorpay_payment_ids)
  // whose migrations may not be applied yet — they just read as undefined.
  const { data: booking } = (await svc
    .from('bookings')
    .select('*, package:packages(host_id), service_listing:service_listings(type)')
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
  // Tier % is measured from the cancellation REQUEST date (explicit asOfIso, else
  // the booking's own cancellation_requested_at) so a slow admin approval can't
  // quietly drop the refund into a lower tier; falls back to "now".
  const asOfIso = opts?.asOfIso ?? booking.cancellation_requested_at ?? undefined
  const tierPercent = Number.isFinite(overrideTierPercent as number)
    ? Math.max(0, Math.min(100, overrideTierPercent as number))
    : currentRefundPercent(travelDateIso, tiers, asOfIso ? new Date(asOfIso) : undefined)

  // Gateway-fee inputs (cash collected + captured payments) — used to deduct the
  // non-refundable transaction charge from whatever gross refund we land on.
  const amountPaidPaise = (booking.deposit_paise ?? booking.total_amount_paise) || 0
  const payments = Array.isArray(booking.razorpay_payment_ids) ? booking.razorpay_payment_ids : []
  const feeSettings = await loadGatewayFeeSettings()
  const finalize = (
    base: Omit<CancellationQuote, 'amountPaidPaise' | 'grossRefundPaise' | 'gatewayFeePaise' | 'netRefundPaise'>,
  ): CancellationQuote => {
    const grossRefundPaise = Math.min(base.totalRefundPaise, Math.max(0, amountPaidPaise))
    const ded = computeGatewayFeeDeduction({
      payments,
      grossRefundPaise,
      deductEnabled: feeSettings.deductEnabled,
      fallbackPercent: feeSettings.fallbackPercent,
    })
    return { ...base, amountPaidPaise, grossRefundPaise, gatewayFeePaise: ded.gatewayFeePaise, netRefundPaise: ded.netRefundPaise }
  }

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
    return finalize({
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
    })
  }

  // No host_earnings row → UnSOLO-owned trip. Platform absorbs the refund alone.
  const gross = booking.gross_paise ?? booking.total_amount_paise ?? 0
  const total = Math.round(gross * (tierPercent / 100))
  return finalize({
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
  })
}

async function applyRefundSplitCore(
  svc: SupabaseClient,
  quote: CancellationQuote,
  refundPaise: number,
  tierPercent: number,
): Promise<void> {
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

  const scaledSplit = splitRefundPaise({
    hostPaise: quote.hostPaise,
    platformPaise: quote.platformPaise,
    tierPercent: quote.hostPaise > 0 ? (hostRefundPaise / quote.hostPaise) * 100 : 0,
    alreadyReleasedPaise: quote.alreadyReleasedPaise,
  })

  const { data: earning } = await svc
    .from('host_earnings')
    .select('id')
    .eq('booking_id', quote.bookingId)
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
        host_paise: Math.max(0, quote.hostPaise - scaledSplit.hostClawbackPaise),
        payout_status: 'cancelled',
      })
      .eq('id', earning.id)
  }
}

export type TravelerCancellationPreview = {
  bookingId: string
  /** Final amount credited after gateway charges (= what the customer receives). */
  estimatedRefundPaise: number
  tierPercent: number
  travelDateIso: string | null
  amountPaidPaise: number
  /** Tier refund before gateway charges. */
  grossRefundPaise: number
  /** Non-refundable payment-gateway charge deducted. */
  gatewayFeePaise: number
  /** Razorpay can refund to the original payment method when this is true */
  canAutoRefund: boolean
}

/**
 * Safe quote for the signed-in traveler (booking must belong to them).
 */
export async function getTravelerCancellationPreview(
  bookingId: string,
): Promise<{ preview: TravelerCancellationPreview } | { error: string }> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: row } = await supabase
    .from('bookings')
    .select('id, status, cancellation_status, total_amount_paise, deposit_paise, stripe_payment_intent')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!row) return { error: 'Booking not found' }
  if (row.status !== 'confirmed') {
    return { error: 'Only confirmed bookings can use self-service cancellation.' }
  }
  if (row.cancellation_status === 'requested') {
    return {
      error:
        'You already have a cancellation request under review. We will notify you when it is processed.',
    }
  }

  const quote = await quoteCancellationRefund(bookingId)
  if ('error' in quote) return { error: quote.error }

  // estimatedRefundPaise is the NET amount the customer actually receives
  // (gross tier refund, capped at amount paid, minus gateway charges).
  return {
    preview: {
      bookingId,
      estimatedRefundPaise: quote.netRefundPaise,
      tierPercent: quote.tierPercent,
      travelDateIso: quote.travelDateIso,
      amountPaidPaise: quote.amountPaidPaise,
      grossRefundPaise: quote.grossRefundPaise,
      gatewayFeePaise: quote.gatewayFeePaise,
      canAutoRefund: Boolean(row.stripe_payment_intent) && quote.netRefundPaise > 0,
    },
  }
}

/**
 * Write host_earnings refund split from a trusted server path (self-service cancel).
 * Idempotent: skips if host_earnings.cancelled_at is already set.
 */
export async function applyRefundSplitToEarningSystem(
  bookingId: string,
  tierPercent: number,
  refundPaise: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (refundPaise <= 0) return { ok: true }

  const svc = await createServiceClient()
  const { data: earningRow } = await svc
    .from('host_earnings')
    .select('id, cancelled_at')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (earningRow?.cancelled_at) {
    return { ok: true }
  }

  const quote = await quoteCancellationRefund(bookingId, tierPercent)
  if ('error' in quote) return { ok: false, error: quote.error }

  await applyRefundSplitCore(svc, quote, refundPaise, tierPercent)
  return { ok: true }
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
  const { supabase, user } = await getActionAuth()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }

  const quote = await quoteCancellationRefund(bookingId, tierPercent)
  if ('error' in quote) return { ok: false, error: quote.error }

  const svc = await createServiceClient()
  await applyRefundSplitCore(svc, quote, refundPaise, tierPercent)

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

  return { ok: true, split: { ...quote, hostRefundPaise, platformRefundPaise, totalRefundPaise: refundPaise } }
}
