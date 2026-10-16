/** Setting keys → labels; shared by the Settings page and the admin search palette. */
export const SETTING_LABELS: Record<
  string,
  { label: string; type: 'number' | 'text' | 'textarea' | 'json' | 'refund_tiers' }
> = {
  host_max_group_size: { label: 'Max group size (hosts)', type: 'number' },
  platform_fee_percent: { label: 'Commission % — Trips', type: 'number' },
  platform_fee_percent_stays: { label: 'Commission % — Stays', type: 'number' },
  platform_fee_percent_activities: { label: 'Commission % — Activities', type: 'number' },
  platform_fee_percent_rentals: { label: 'Commission % — Rentals', type: 'number' },
  platform_fee_percent_getting_around: { label: 'Commission % — Getting Around', type: 'number' },
  join_payment_deadline_hours: { label: 'Payment deadline (hours)', type: 'number' },
  deduct_gateway_fee_on_refund: { label: 'Deduct gateway charges from refunds (true / false)', type: 'text' },
  gateway_fee_fallback_percent: { label: 'Gateway fee fallback % (used when a payment’s real fee is unknown)', type: 'number' },
  refund_tiers_unsolo: {
    label: 'Refund tiers — UnSOLO trips',
    type: 'refund_tiers',
  },
  refund_tiers_host: {
    label: 'Refund tiers — Community / host trips',
    type: 'refund_tiers',
  },
  refund_tiers_stays: {
    label: 'Refund tiers — Stays',
    type: 'refund_tiers',
  },
  refund_tiers_activities: {
    label: 'Refund tiers — Activities',
    type: 'refund_tiers',
  },
  refund_tiers_rentals: {
    label: 'Refund tiers — Rentals',
    type: 'refund_tiers',
  },
  share_poster_share_title: { label: 'Native share title', type: 'text' },
  share_poster_share_text: { label: 'Native share message', type: 'textarea' },
  share_poster_footer_tagline: {
    label: 'Share poster footer tagline',
    type: 'textarea',
  },
  support_whatsapp_number: { label: 'Default WhatsApp number', type: 'text' },
  wander_hero_image_url: {
    label: 'Wander page — hero image (URL or upload)',
    type: 'text',
  },
  wander_trust_badge_text: {
    label: 'Wander page — top badge (hero, left)',
    type: 'textarea',
  },
  wander_hero_line1: { label: 'Wander hero — headline line 1', type: 'text' },
  wander_hero_line2_before: { label: 'Wander hero — line 2 prefix (before accent word)', type: 'text' },
  wander_hero_line2_accent: { label: 'Wander hero — accent word(s) on line 2 (brand gold)', type: 'text' },
  wander_hero_line2_after: { label: 'Wander hero — line 2 suffix (after accent)', type: 'text' },
  wander_hero_subtitle: { label: 'Wander hero — subtitle paragraph', type: 'textarea' },
  wander_hero_headline_link_url: { label: 'Wander hero — optional link for headline (path or HTTPS)', type: 'text' },
  wander_hero_subtitle_link_url: { label: 'Wander hero — optional link for subtitle (path or HTTPS)', type: 'text' },
  wander_hero_instagram_text: { label: 'Wander hero — Instagram label (next to icon)', type: 'text' },
  wander_hero_instagram_url: { label: 'Wander hero — Instagram URL (https://)', type: 'text' },
  wander_hero_mobile_content_mode: { label: 'Wander hero — mobile content mode', type: 'text' },
  wander_hero_mobile_instagram_text: { label: 'Wander hero — mobile Instagram label', type: 'text' },
  wander_hero_mobile_instagram_url: { label: 'Wander hero — mobile Instagram URL', type: 'text' },
  wander_hero_mobile_trips_eyebrow: { label: 'Wander hero — mobile trips eyebrow', type: 'text' },
  wander_hero_mobile_trips_title: { label: 'Wander hero — mobile trips title', type: 'text' },
  wander_hero_mobile_trips_subtitle: { label: 'Wander hero — mobile trips subtitle', type: 'textarea' },
  wander_hero_mobile_rentals_eyebrow: { label: 'Wander hero — mobile rentals eyebrow', type: 'text' },
  wander_hero_mobile_rentals_title: { label: 'Wander hero — mobile rentals title', type: 'text' },
  wander_hero_mobile_rentals_subtitle: { label: 'Wander hero — mobile rentals subtitle', type: 'textarea' },
  wander_hero_mobile_activities_eyebrow: { label: 'Wander hero — mobile activities eyebrow', type: 'text' },
  wander_hero_mobile_activities_title: { label: 'Wander hero — mobile activities title', type: 'text' },
  wander_hero_mobile_activities_subtitle: { label: 'Wander hero — mobile activities subtitle', type: 'textarea' },
  wander_hero_mobile_stays_eyebrow: { label: 'Wander hero — mobile stays eyebrow', type: 'text' },
  wander_hero_mobile_stays_title: { label: 'Wander hero — mobile stays title', type: 'text' },
  wander_hero_mobile_stays_subtitle: { label: 'Wander hero — mobile stays subtitle', type: 'textarea' },
  wander_hero_mobile_font_mode: { label: 'Wander hero — mobile font mode', type: 'text' },
  wander_hero_desktop_badge_size: { label: 'Wander hero — desktop badge size', type: 'text' },
  wander_hero_desktop_headline_size: { label: 'Wander hero — desktop headline size', type: 'text' },
  wander_hero_desktop_subtitle_size: { label: 'Wander hero — desktop subtitle size', type: 'text' },
  wander_hero_desktop_instagram_size: { label: 'Wander hero — desktop Instagram size', type: 'text' },
  wander_hero_mobile_badge_size: { label: 'Wander hero — mobile eyebrow size', type: 'text' },
  wander_hero_mobile_headline_size: { label: 'Wander hero — mobile headline size', type: 'text' },
  wander_hero_mobile_subtitle_size: { label: 'Wander hero — mobile subtitle size', type: 'text' },
  wander_hero_mobile_instagram_size: { label: 'Wander hero — mobile Instagram size', type: 'text' },
  wander_hero_mobile_stats_size: { label: 'Wander hero — mobile stats size', type: 'text' },
}

export const SHARE_POSTER_SETTING_KEYS = ['share_poster_share_title', 'share_poster_share_text', 'share_poster_footer_tagline'] as const
export const REFUND_SETTING_KEYS = ['refund_tiers_unsolo', 'refund_tiers_host', 'refund_tiers_stays', 'refund_tiers_activities', 'refund_tiers_rentals'] as const

export type SettingGroup = 'general' | 'share' | 'refund'

export function settingGroupOf(key: string): SettingGroup {
  if ((SHARE_POSTER_SETTING_KEYS as readonly string[]).includes(key)) return 'share'
  if ((REFUND_SETTING_KEYS as readonly string[]).includes(key)) return 'refund'
  return 'general'
}
