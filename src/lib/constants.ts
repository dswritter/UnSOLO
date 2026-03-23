// ── UnSOLO Business Constants ────────────────────────────────
// Centralized configuration — change here, applies everywhere.

/** Hours before a pending (unpaid) booking is auto-cancelled */
export const PENDING_BOOKING_EXPIRY_HOURS = 48

/** Hours before an unpaid group booking is auto-cancelled */
export const GROUP_PAYMENT_DEADLINE_HOURS = 24

/** Max years into the future a booking date can be */
export const MAX_BOOKING_FUTURE_YEARS = 2

/** Credit given to referrer when referred user completes first booking (paise) */
export const REFERRAL_CREDIT_PAISE = 50000 // ₹500

/** Discount given to referred user on their first booking (paise) */
export const REFERRED_DISCOUNT_PAISE = 20000 // ₹200

/** Length of auto-generated referral codes */
export const REFERRAL_CODE_LENGTH = 8

/** App URL for sharing */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://unsolo-two.vercel.app'
