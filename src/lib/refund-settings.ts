import { createServiceClient } from '@/lib/supabase/server'

export type GatewayFeeSettings = {
  /** When true, non-refundable payment-gateway charges are deducted from refunds. */
  deductEnabled: boolean
  /** Fallback fee % applied to a payment when its real Razorpay fee isn't known. */
  fallbackPercent: number
}

// Default ON, with a ~2% fallback. Override via platform_settings keys
// `deduct_gateway_fee_on_refund` ('true'|'false') and `gateway_fee_fallback_percent`.
const DEFAULTS: GatewayFeeSettings = { deductEnabled: true, fallbackPercent: 2 }

export async function loadGatewayFeeSettings(): Promise<GatewayFeeSettings> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc
      .from('platform_settings')
      .select('key, value')
      .in('key', ['deduct_gateway_fee_on_refund', 'gateway_fee_fallback_percent'])
    const map = Object.fromEntries((data || []).map((r) => [r.key as string, r.value as unknown]))
    const enabledRaw = map['deduct_gateway_fee_on_refund']
    const pctRaw = map['gateway_fee_fallback_percent']
    return {
      deductEnabled: enabledRaw == null ? DEFAULTS.deductEnabled : String(enabledRaw) !== 'false',
      fallbackPercent: pctRaw == null ? DEFAULTS.fallbackPercent : Number(pctRaw) || DEFAULTS.fallbackPercent,
    }
  } catch {
    return DEFAULTS
  }
}
