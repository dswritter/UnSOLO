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

// ── Peer Hosting Constants ──────────────────────────────────

/**
 * Fallback when `platform_settings.platform_fee_percent` is missing or invalid.
 * Prefer `getPlatformFeePercent()` from `@/lib/platform-settings` on the server.
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = 15

/** @deprecated Use getPlatformFeePercent() or DEFAULT_PLATFORM_FEE_PERCENT */
export const PLATFORM_FEE_PERCENT = DEFAULT_PLATFORM_FEE_PERCENT

/** Hours a traveler has to complete payment after host approval */
export const JOIN_PAYMENT_DEADLINE_HOURS = 48

/** Days before departure to send token-balance email + in-app reminder (cron) */
export const TOKEN_BALANCE_REMINDER_DAYS_BEFORE = 7

/** Max OTP send attempts per rolling hour (per user); enforced server-side */
export const MAX_OTP_PER_HOUR = 8

/** Minimum seconds between OTP send requests (per user); enforced server-side */
export const MIN_OTP_SEND_INTERVAL_SECONDS = 45

/** Max OTP verify attempts before lockout */
export const MAX_OTP_VERIFY_ATTEMPTS = 5

/** Image uploads (package, avatar, status, etc.) — must match /api/upload */
export const UPLOAD_MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const UPLOAD_IMAGE_TOO_LARGE_MESSAGE =
  'This image is larger than 5MB. Please upload an image under 5MB.'

/** OTP expiry in minutes */
export const OTP_EXPIRY_MINUTES = 10

/** Interest tags available for trip preferences */
export const INTEREST_TAGS = [
  'Trekking', 'Beach', 'Wildlife', 'Culture', 'Food', 'Photography',
  'Adventure Sports', 'Camping', 'Road Trip', 'Spiritual', 'Nightlife',
  'Budget Travel', 'Luxury', 'Solo-Friendly', 'Backpacking', 'Yoga & Wellness',
] as const
