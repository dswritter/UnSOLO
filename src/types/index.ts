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

export type Package = {
  id: string
  destination_id: string
  title: string
  slug: string
  description: string
  short_description: string | null
  price_paise: number
  duration_days: number
  max_group_size: number
  difficulty: 'easy' | 'moderate' | 'challenging'
  includes: string[] | null
  images: string[] | null
  is_featured: boolean
  is_active: boolean
  stripe_price_id: string | null
  departure_dates: string[] | null
  created_at: string
  destination?: Destination
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
  package_id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  travel_date: string
  guests: number
  total_amount_paise: number
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
  admin_cancellation_note?: string | null
  created_at: string
  updated_at: string
  package?: Package
  user?: Profile
  poc?: Profile
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
  created_at: string
  user?: Profile
  package?: Package
}

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
