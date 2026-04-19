import type { JoinPreferences } from '@/types'

/** Host-set token deposit (balance later). True if explicitly enabled or legacy `payment_timing === 'token_to_book'`. */
export function isTokenDepositEnabled(jp: JoinPreferences | null | undefined): boolean {
  if (!jp) return false
  if (jp.token_deposit_enabled === true) return true
  return jp.payment_timing === 'token_to_book'
}

/**
 * Community trips: package page uses BookingForm (pay at checkout) instead of join requests.
 * Legacy `token_to_book` was stored as exclusive payment_timing but behaved like direct checkout + token.
 */
export function isCommunityDirectCheckout(jp: JoinPreferences | null | undefined): boolean {
  if (!jp) return false
  if (jp.payment_timing === 'pay_on_booking') return true
  if (jp.payment_timing === 'token_to_book') return true
  return false
}
