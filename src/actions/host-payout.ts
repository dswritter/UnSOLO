'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { logAuditEvent } from '@/actions/admin'
import {
  createBankFundAccount,
  createContact,
  createPayout,
  createUpiFundAccount,
  isRazorpayXConfigured,
} from '@/lib/razorpay/x'
import {
  parseRefundTiersJson,
  defaultHostRefundTiers,
  currentRefundPercent,
  type RefundTier,
} from '@/lib/refund-tiers'

type RefundSchedule = { tiers: RefundTier[] }

async function getHostRefundTiers(): Promise<RefundSchedule> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'refund_tiers_host')
    .maybeSingle()
  const tiers = parseRefundTiersJson((data?.value as string | null) ?? null, defaultHostRefundTiers())
  return { tiers }
}

export async function getReleasableHostEarning(earningId: string): Promise<{
  hostPaise: number
  releasedPaise: number
  unpaidPaise: number
  safePaise: number
  currentRefundPct: number
  inZeroRefundWindow: boolean
  travelDateIso: string | null
} | { error: string }> {
  const supabase = await createServiceClient()
  const { data: earning } = await supabase
    .from('host_earnings')
    .select('host_paise, released_paise, booking_id')
    .eq('id', earningId)
    .single()
  if (!earning) return { error: 'Earning not found' }

  let travelDateIso: string | null = null
  if (earning.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('travel_date, check_in_date')
      .eq('id', earning.booking_id)
      .single()
    travelDateIso = (booking?.travel_date as string | null) ?? (booking?.check_in_date as string | null) ?? null
  }

  const { tiers } = await getHostRefundTiers()
  const currentRefundPct = travelDateIso ? currentRefundPercent(travelDateIso, tiers) : 0
  const hostPaise = earning.host_paise as number
  const releasedPaise = (earning.released_paise as number) || 0
  const unpaidPaise = Math.max(0, hostPaise - releasedPaise)
  // Safe advance = host's share that cannot be clawed back even at the current refund percent.
  const safePaise = Math.floor(hostPaise * (1 - currentRefundPct / 100)) - releasedPaise

  return {
    hostPaise,
    releasedPaise,
    unpaidPaise,
    safePaise: Math.max(0, safePaise),
    currentRefundPct,
    inZeroRefundWindow: currentRefundPct <= 0,
    travelDateIso,
  }
}

type PayoutInput = {
  earningId: string
  amountPaise: number
  /** Set true to bypass the 0%-refund gate. Records override reason in audit log. */
  override?: boolean
  overrideReason?: string
  /** If true, skip RazorpayX and just record a manual reference (legacy flow). */
  manual?: boolean
  manualReference?: string
}

async function requireAdminLocal() {
  const { supabase, user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    throw new Error('Admin access required')
  }
  return { supabase, userId: user.id }
}

async function ensureFundAccount(hostId: string): Promise<
  | { ok: true; contactId: string; fundAccountId: string; mode: 'UPI' | 'IMPS' }
  | { ok: false; error: string }
> {
  const svc = await createServiceClient()
  const { data: profile } = await svc
    .from('profiles')
    .select('id, full_name, email, phone_number, upi_id, bank_account_name, bank_account_number, bank_ifsc, payout_method, razorpayx_contact_id, razorpayx_fund_account_id')
    .eq('id', hostId)
    .single()
  if (!profile) return { ok: false, error: 'Host profile not found' }

  if (profile.razorpayx_contact_id && profile.razorpayx_fund_account_id) {
    const mode: 'UPI' | 'IMPS' = profile.payout_method === 'upi' ? 'UPI' : 'IMPS'
    return {
      ok: true,
      contactId: profile.razorpayx_contact_id,
      fundAccountId: profile.razorpayx_fund_account_id,
      mode,
    }
  }

  let contactId = profile.razorpayx_contact_id as string | null
  if (!contactId) {
    const contact = await createContact({
      name: profile.full_name || 'UnSOLO Host',
      email: profile.email || undefined,
      contact: profile.phone_number || undefined,
      reference_id: `host_${profile.id}`,
    })
    contactId = contact.id
    await svc.from('profiles').update({ razorpayx_contact_id: contactId }).eq('id', profile.id)
  }

  let fundAccountId: string | null = null
  let mode: 'UPI' | 'IMPS' = 'IMPS'
  if (profile.payout_method === 'upi') {
    if (!profile.upi_id) return { ok: false, error: 'Host has no UPI ID saved' }
    const fa = await createUpiFundAccount(contactId, profile.upi_id)
    fundAccountId = fa.id
    mode = 'UPI'
  } else {
    if (!profile.bank_account_number || !profile.bank_ifsc || !profile.bank_account_name) {
      return { ok: false, error: 'Host bank details incomplete' }
    }
    const fa = await createBankFundAccount(contactId, {
      name: profile.bank_account_name,
      ifsc: profile.bank_ifsc,
      account_number: profile.bank_account_number,
    })
    fundAccountId = fa.id
    mode = 'IMPS'
  }

  await svc.from('profiles').update({ razorpayx_fund_account_id: fundAccountId }).eq('id', profile.id)
  return { ok: true, contactId, fundAccountId, mode }
}

export async function releaseHostPayout(input: PayoutInput) {
  try {
    const { userId } = await requireAdminLocal()
    const svc = await createServiceClient()

    const amount = Math.round(input.amountPaise)
    if (amount <= 0) return { error: 'Payout amount must be positive' }

    const info = await getReleasableHostEarning(input.earningId)
    if ('error' in info) return { error: info.error }
    if (amount > info.unpaidPaise) return { error: 'Amount exceeds the remaining host balance' }

    if (!input.override && !info.inZeroRefundWindow && amount > info.safePaise) {
      return {
        error: `Only ${(info.safePaise / 100).toLocaleString('en-IN')} is safe to release now — refund window still allows ${info.currentRefundPct}% cancellation. Pass override=true with a reason to force.`,
      }
    }

    const { data: earning } = await svc
      .from('host_earnings')
      .select('host_id, booking_id')
      .eq('id', input.earningId)
      .single()
    if (!earning) return { error: 'Earning not found' }

    // Manual fallback: admin paid outside the app, just record the reference.
    if (input.manual || !isRazorpayXConfigured()) {
      if (!input.manualReference) return { error: 'Manual reference required' }
      await svc
        .from('host_earnings')
        .update({
          released_paise: info.releasedPaise + amount,
          payout_status: amount + info.releasedPaise >= info.hostPaise ? 'completed' : 'processing',
          payout_date: new Date().toISOString(),
          payout_reference: input.manualReference,
        })
        .eq('id', input.earningId)

      await logAuditEvent(userId, 'release_host_payout_manual', 'host_earning', input.earningId, {
        amount_paise: amount,
        reference: input.manualReference,
        override: !!input.override,
        override_reason: input.overrideReason,
      })
      return { success: true, mode: 'manual' as const }
    }

    // RazorpayX payout.
    const fa = await ensureFundAccount(earning.host_id as string)
    if (!fa.ok) return { error: fa.error }

    const payout = await createPayout({
      account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER!,
      fund_account_id: fa.fundAccountId,
      amount_paise: amount,
      mode: fa.mode,
      purpose: 'vendor advance',
      reference_id: `he_${input.earningId}`,
      narration: 'UnSOLO host payout',
    })

    await svc
      .from('host_earnings')
      .update({
        released_paise: info.releasedPaise + amount,
        razorpay_payout_id: payout.id,
        payout_mode: fa.mode,
        payout_status: payout.status === 'processed' ? 'processed' : 'processing',
        payout_reference: payout.id,
      })
      .eq('id', input.earningId)

    await logAuditEvent(userId, 'release_host_payout_rpx', 'host_earning', input.earningId, {
      amount_paise: amount,
      payout_id: payout.id,
      mode: fa.mode,
      override: !!input.override,
      override_reason: input.overrideReason,
    })

    return { success: true, mode: 'razorpayx' as const, payoutId: payout.id, status: payout.status }
  } catch (err) {
    console.error('releaseHostPayout failed', err)
    return { error: err instanceof Error ? err.message : 'Payout failed' }
  }
}
