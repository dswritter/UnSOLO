export type UserRole = 'user' | 'admin' | 'social_media_manager' | 'field_person' | 'chat_responder'

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  admin: 'Admin',
  social_media_manager: 'Social Media Manager',
  field_person: 'Field Person',
  chat_responder: 'Chat Responder',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  user: 'bg-zinc-700 text-zinc-200',
  admin: 'bg-red-900/50 text-red-300 border border-red-700',
  social_media_manager: 'bg-purple-900/50 text-purple-300 border border-purple-700',
  field_person: 'bg-green-900/50 text-green-300 border border-green-700',
  chat_responder: 'bg-blue-900/50 text-blue-300 border border-blue-700',
}

export type Profile = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  travel_style: string[] | null
  languages: string[] | null
  instagram_url: string | null
  website_url: string | null
  is_verified: boolean
  role: UserRole
  username_changed_at: string | null
  phone_number?: string | null
  phone_public?: boolean
  email?: string | null
  referral_code?: string | null
  referred_by?: string | null
  referral_credits_paise?: number
  is_phone_verified?: boolean
  is_email_verified?: boolean
  is_host?: boolean
  host_rating?: number
  total_hosted_trips?: number
  date_of_birth?: string | null
  created_at: string
  updated_at: string
}

export type TeamMember = {
  id: string
  user_id: string
  role: UserRole
  added_by: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  profile?: Profile
}

export type Destination = {
  id: string
  name: string
  state: string
  country: string
  slug: string
  image_url: string | null
  description: string | null
  created_at: string
}

export type JoinPreferences = {
  min_age?: number
  max_age?: number
  gender_preference?: 'men' | 'women' | 'all'
  min_trips_completed?: number
  interest_tags?: string[]
  /**
   * `after_host_approval` (default): request → host approves → pay.
   * `pay_on_booking`: standard checkout; no join-request gate.
   * `token_to_book`: legacy only — same as pay_on_booking + token; prefer `token_deposit_enabled`.
   */
  payment_timing?: 'after_host_approval' | 'pay_on_booking' | 'token_to_book'
  /** When true, travelers pay a per-person token first; balance from My Trips. Combines with `payment_timing`. */
  token_deposit_enabled?: boolean
  /** Required when token deposit is enabled (or legacy `token_to_book`). */
  token_amount_paise?: number
}

export type HostProfile = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  host_rating: number | null
  is_verified: boolean
  total_hosted_trips: number | null
}

export type Package = {
  id: string
  destination_id: string
  title: string
  slug: string
  description: string
  short_description: string | null
  price_paise: number
  /** When set: 2+ tiers { description, price_paise }; price_paise is min tier for filters. */
  price_variants?: { description: string; price_paise: number }[] | null
  duration_days: number
  /** Display: on-trip days (host/admin entered). Falls back to duration_days if null. */
  trip_days?: number | null
  trip_nights?: number | null
  exclude_first_day_travel?: boolean | null
  /** Parallel to departure_dates — explicit return/arrival date per offered start date. */
  return_dates?: string[] | null
  departure_time?: 'morning' | 'evening' | null
  return_time?: 'morning' | 'evening' | null
  max_group_size: number
  difficulty: 'easy' | 'moderate' | 'challenging'
  includes: string[] | null
  images: string[] | null
  is_featured: boolean
  is_active: boolean
  stripe_price_id: string | null
  departure_dates: string[] | null
  /** Departure start dates the host marked full (no new bookings). */
  departure_dates_closed?: string[] | null
  host_id: string | null
  /** Per-listing WhatsApp number override (digits only, country code first). NULL = use platform default. */
  whatsapp_number?: string | null
  moderation_status: 'pending' | 'approved' | 'rejected' | null
  /** Set once, on first admin approval; never cleared on later pending resets. */
  first_approved_at?: string | null
  join_preferences: JoinPreferences | null
  created_at: string
  updated_at?: string | null
  destination?: Destination
  host?: HostProfile
}

export type CustomDateRequest = {
  id: string
  user_id: string
  package_id: string
  requested_date: string
  guests: number
  contact_number: string
  contact_email: string
  status: 'pending' | 'approved' | 'rejected'
  assigned_to: string | null
  admin_notes: string | null
  created_at: string
  user?: Profile
  package?: Package
}

export type Booking = {
  id: string
  user_id: string
  package_id: string | null
  service_listing_id?: string | null
  booking_type?: 'trip' | 'service'
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'pending_approval'
  travel_date: string | null
  check_in_date?: string | null
  check_out_date?: string | null
  guests: number
  total_amount_paise: number
  /** Cumulative paid toward total (wallet + Razorpay); equals total when fully paid. */
  deposit_paise?: number
  wallet_deducted_paise?: number
  price_variant_label?: string | null
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  confirmation_code: string | null
  special_requests: string | null
  assigned_poc: string | null
  poc_shared_at: string | null
  admin_notes: string | null
  cancellation_status?: 'requested' | 'approved' | 'denied' | null
  cancellation_reason?: string | null
  cancellation_requested_at?: string | null
  refund_amount_paise?: number | null
  refund_note?: string | null
  refund_status?: 'pending' | 'processing' | 'completed' | null
  refund_razorpay_id?: string | null
  admin_cancellation_note?: string | null
  quantity?: number
  amount_paise?: number
  /** Host contact info - exposed to booker */
  host_phone?: string | null
  host_email?: string | null
  /** Confirmation email tracking */
  confirmation_email_sent_at?: string | null
  created_at: string
  updated_at: string
  package?: Package
  service_listing?: ServiceListing
  user?: Profile
  poc?: Profile
}

export type ServiceListingType = 'stays' | 'activities' | 'rentals' | 'getting_around'

export type ServiceListingMetadata = {
  // Stays
  num_rooms?: number
  num_bathrooms?: number
  check_in_time?: string
  check_out_time?: string
  cancellation_policy?: string
  // Activities
  duration_hours?: number
  difficulty?: 'easy' | 'moderate' | 'challenging'
  activity_category?: string
  guide_included?: boolean
  // Rentals
  vehicle_type?: string
  fuel_type?: string
  transmission?: string
  mileage_limit_km?: number
  // Getting Around
  transport_type?: string
  capacity_persons?: number
  route_origin?: string
  route_destination?: string
}

export type ServiceListing = {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  type: ServiceListingType
  price_paise: number
  /** When set: 2+ tiers { description, price_paise }; price_paise is min tier for filters. */
  price_variants?: { description: string; price_paise: number }[] | null
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'
  location: string
  /** Primary destination (kept for joins/back-compat; equals `destination_ids[0]`). */
  destination_id: string
  /** Full set of destinations this listing is offered at. First entry is the primary. */
  destination_ids: string[]
  latitude: number | null
  longitude: number | null
  max_guests_per_booking: number | null
  quantity_available: number | null
  images: string[] | null
  amenities: string[] | null
  tags: string[] | null
  metadata: ServiceListingMetadata | null
  host_id: string | null
  is_active: boolean
  is_featured: boolean
  status: 'pending' | 'approved' | 'rejected' | 'archived'
  /** Set once, on first admin approval; never cleared on later pending resets. */
  first_approved_at?: string | null
  average_rating: number
  review_count: number
  created_at: string
  updated_at: string
  destination?: Destination
  host?: HostProfile
}

export type ChatRoom = {
  id: string
  name: string
  type: 'trip' | 'general' | 'direct'
  package_id: string | null
  created_by: string | null
  is_active: boolean
  created_at: string
  package?: Package
  member_count?: number
  last_message?: Message | null
}

export type Message = {
  id: string
  room_id: string
  user_id: string | null
  content: string
  message_type: 'text' | 'image' | 'system'
  is_edited: boolean
  created_at: string
  user?: Profile
}

export type Review = {
  id: string
  booking_id: string
  user_id: string
  package_id: string
  rating: number
  title: string | null
  body: string | null
  images: string[] | null
  /** Review edit tracking */
  is_edited: boolean
  edited_at?: string | null
  created_at: string
  updated_at?: string
  user?: Profile
  package?: Package
}

export type HostRating = {
  id: string
  host_id: string
  booking_id: string
  user_id: string
  rating: number
  comment?: string | null
  created_at: string
  user?: Profile
}

export type ServiceListingItem = {
  id: string
  service_listing_id: string
  name: string
  description: string | null
  price_paise: number
  quantity_available: number
  max_per_booking: number
  images: string[]
  position_order: number
  is_active: boolean
  /** Rentals only: each item carries its own unit (per_hour bike vs per_day car). Null on non-rentals. */
  unit?: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month' | null
  /** Rentals only: per-item amenities (one bike has GPS, another doesn't). Null on non-rentals. */
  amenities?: string[] | null
  created_at: string
  updated_at: string
}

/** @deprecated Use ServiceListingItem. Kept for back-compat. */
export type ServiceInventoryItem = ServiceListingItem

export type UserAchievement = {
  id: string
  user_id: string
  achievement_key: string
  earned_at: string
}

export type LeaderboardScore = {
  user_id: string
  trips_completed: number
  reviews_written: number
  destinations_count: number
  total_score: number
  updated_at: string
  profile?: Profile
}

export type Achievement = {
  key: string
  name: string
  description: string
  icon: string
  points: number
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first_trip', name: 'First Adventure', description: 'Complete your first booking', icon: '✈️', points: 20 },
  { key: 'globe_trotter', name: 'India Explorer', description: 'Visit 5 different states', icon: '🗺️', points: 20 },
  { key: 'storyteller', name: 'Storyteller', description: 'Write 10 reviews', icon: '✍️', points: 20 },
  { key: 'community_pillar', name: 'Community Pillar', description: 'Send 100 chat messages', icon: '💬', points: 20 },
  { key: 'trailblazer', name: 'Trailblazer', description: 'Book a challenging difficulty trip', icon: '🏔️', points: 20 },
  { key: 'connector', name: 'Connector', description: 'Connect with 10 fellow travelers', icon: '🤝', points: 20 },
  { key: 'reviewer_5', name: 'Critic', description: 'Write 5 reviews', icon: '⭐', points: 20 },
  { key: 'himalayan', name: 'Himalayan Soul', description: 'Complete a Himalayan trip', icon: '🏔️', points: 20 },
]

export function formatPrice(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
