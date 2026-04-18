export const revalidate = 300 // 5 minutes

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Clock, Users, CheckCircle, Star, ArrowLeft, ShieldCheck, Award } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import Link from 'next/link'
import { ImageGallery } from '@/components/packages/ImageGallery'
import { BookingFormClient } from '@/components/packages/BookingFormClient'
import { JoinRequestForm } from '@/components/hosting/JoinRequestForm'
import { InterestButton } from '@/components/packages/InterestButton'
import { ShareButton } from '@/components/packages/ShareButton'
import { getInterestData } from '@/actions/booking'
import type { Package, HostProfile, JoinPreferences } from '@/types'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  challenging: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const GENDER_LABELS: Record<string, string> = {
  women: 'Women only',
  men: 'Men only',
  all: 'All genders welcome',
}

export default async function PackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ group?: string }>
}) {
  const { slug } = await params
  const { group: groupId } = await searchParams
  const supabase = await createClient()

  // Get auth user first to check if admin or host
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: string | null = null
  if (user) {
    const { data: userProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    userRole = userProfile?.role || null
  }

  // Fetch package — allow admins and the host to see inactive/pending trips
  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
    .eq('slug', slug)

  // Only filter by is_active for regular users
  const isAdminUser = userRole === 'admin'
  const { data: pkg } = await query.single()

  if (!pkg) notFound()

  // If not active: only allow admin or the host to view
  if (!pkg.is_active && !isAdminUser && !(user && pkg.host_id === user.id)) {
    notFound()
  }

  const package_ = pkg as Package
  const isCommunityTrip = !!package_.host_id
  const hostData = (pkg.host as unknown as HostProfile) || null
  const isHost = !!user && !!package_.host_id && user.id === package_.host_id

  // Fetch existing join request if community trip and user is logged in
  let existingRequest = null
  if (isCommunityTrip && user && !isHost) {
    const { data: jr } = await supabase
      .from('join_requests')
      .select('id, status, message, host_response, payment_deadline')
      .eq('trip_id', package_.id)
      .eq('user_id', user.id)
      .single()
    if (jr) {
      existingRequest = jr as { id: string; status: 'pending' | 'approved' | 'rejected'; message: string | null; host_response: string | null; payment_deadline: string | null }
    }
  }

  // Fetch group invite data if arriving via group invite link (only for UnSOLO trips)
  let groupInvite: { id: string; travel_date: string; organizer_name: string } | null = null
  if (groupId && !isCommunityTrip) {
    const { data: gData } = await supabase
      .from('group_bookings')
      .select('id, travel_date, organizer:profiles!group_bookings_organizer_id_fkey(full_name, username)')
      .eq('id', groupId)
      .eq('status', 'open')
      .single()
    if (gData) {
      const org = gData.organizer as unknown as { full_name: string | null; username: string }
      groupInvite = {
        id: gData.id,
        travel_date: gData.travel_date,
        organizer_name: org?.full_name || org?.username || 'Someone',
      }
    }
  }

  // Calculate available slots per departure date (only for UnSOLO trips)
  const availableSlotsMap: Record<string, number> = {}
  if (!isCommunityTrip && package_.departure_dates && package_.max_group_size) {
    for (const date of package_.departure_dates) {
      const { data: dateBookings } = await supabase
        .from('bookings')
        .select('guests')
        .eq('package_id', pkg.id)
        .eq('travel_date', date)
        .in('status', ['pending', 'confirmed', 'completed'])
      const totalBooked = (dateBookings || []).reduce((sum, b) => sum + (b.guests || 1), 0)
      availableSlotsMap[date] = Math.max(0, package_.max_group_size - totalBooked)
    }
  }

  // Get reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*, user:profiles(username, full_name, avatar_url)')
    .eq('package_id', pkg.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const avgRating = reviews?.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0
  const avgDest = reviews?.length
    ? reviews.reduce((sum, r) => sum + (r.rating_destination || r.rating), 0) / reviews.length
    : 0
  const avgExp = reviews?.length
    ? reviews.reduce((sum, r) => sum + (r.rating_experience || r.rating), 0) / reviews.length
    : 0

  // Get interest data
  const interestData = await getInterestData(pkg.id)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <Link href={isCommunityTrip ? '/explore?tab=community' : '/explore'} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explore
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero image gallery */}
            <ImageGallery images={package_.images || []} title={package_.title} />

            {/* Title + Location + Badges */}
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                {package_.destination?.name}, {package_.destination?.state}
              </div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl md:text-4xl font-black">{package_.title}</h1>
                <div className="flex gap-2 flex-shrink-0 mt-1">
                  <Badge className={DIFFICULTY_COLORS[package_.difficulty]}>
                    {package_.difficulty}
                  </Badge>
                  {isCommunityTrip && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Community Trip</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Interested + Share */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <InterestButton
                packageId={package_.id}
                initialCount={interestData.count}
                initialInterested={interestData.isInterested}
                isLoggedIn={!!user}
              />
              <ShareButton
                slug={package_.slug}
                title={package_.title}
                location={`${package_.destination?.name}, ${package_.destination?.state}`}
                pricePaise={package_.price_paise}
                durationSummary={packageDurationShortLabel(package_)}
              />
            </div>

            {/* Host profile card (community trips only) */}
            {isCommunityTrip && hostData && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Your Host</h2>
                <div className="flex items-start gap-4">
                  <Link href={`/profile/${hostData.username}`}>
                    {hostData.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hostData.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/20 hover:ring-primary/40 transition-all" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
                        {(hostData.full_name || hostData.username || 'H')[0].toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/profile/${hostData.username}`} className="font-bold text-foreground hover:text-primary transition-colors">
                        {hostData.full_name || hostData.username}
                      </Link>
                      {hostData.is_verified && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {hostData.host_rating != null && hostData.host_rating > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                          {hostData.host_rating.toFixed(1)} rating
                        </span>
                      )}
                      {hostData.total_hosted_trips != null && hostData.total_hosted_trips > 0 && (
                        <span className="flex items-center gap-1">
                          <Award className="h-3.5 w-3.5 text-primary" />
                          {hostData.total_hosted_trips} trips hosted
                        </span>
                      )}
                    </div>
                    {hostData.bio && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{hostData.bio}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Join preferences (community trips only) */}
            {isCommunityTrip && package_.join_preferences && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-bold mb-3">Who Can Join</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {package_.join_preferences.gender_preference && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">{GENDER_LABELS[package_.join_preferences.gender_preference] || 'All genders welcome'}</span>
                    </div>
                  )}
                  {package_.join_preferences.min_trips_completed != null && package_.join_preferences.min_trips_completed > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">
                        Minimum {package_.join_preferences.min_trips_completed} completed trips
                      </span>
                    </div>
                  )}
                  {package_.join_preferences.interest_tags && package_.join_preferences.interest_tags.length > 0 && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">
                        Interests: {package_.join_preferences.interest_tags.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Clock, label: 'Duration', value: packageDurationShortLabel(package_) },
                { icon: Users, label: 'Group Size', value: `Up to ${package_.max_group_size}` },
                { icon: Star, label: 'Rating', value: avgRating ? `${avgRating.toFixed(1)}/5` : 'New' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <Icon className="h-5 w-5 text-primary mx-auto mb-1" />
                  <div className="font-bold text-sm">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-3">About This Trip</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{package_.description}</p>
            </div>

            {/* What's Included */}
            {package_.includes && package_.includes.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-bold mb-4">What&apos;s Included</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {package_.includes.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div id="review" className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">
                Reviews {reviews?.length ? `(${reviews.length})` : ''}
              </h2>

              {/* Rating summary */}
              {reviews && reviews.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-secondary/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-black text-primary">{avgRating.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Overall</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">{avgDest.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Destination</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">{avgExp.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Experience</div>
                  </div>
                </div>
              )}

              {reviews && reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-border pb-4 last:border-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Link href={`/profile/${review.user?.username || ''}`} className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary hover:ring-2 hover:ring-primary/40 transition-all">
                          {review.user?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={review.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            (review.user?.full_name || review.user?.username || 'U')[0].toUpperCase()
                          )}
                        </Link>
                        <div className="flex-1">
                          <Link href={`/profile/${review.user?.username || ''}`} className="text-sm font-medium hover:text-primary transition-colors">
                            {review.user?.full_name || review.user?.username}
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDate(review.created_at)}</div>
                        </div>
                        <div className="text-right text-xs space-y-0.5">
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-muted-foreground">Destination</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-3 w-3 ${i < (review.rating_destination || review.rating) ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-muted-foreground">Experience</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-3 w-3 ${i < (review.rating_experience || review.rating) ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      {review.title && <h4 className="text-sm font-semibold mb-1">{review.title}</h4>}
                      {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No reviews yet. Be the first to explore this trip!</p>
              )}
            </div>
          </div>

          {/* Sidebar - Booking / Join */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-4">
                  {isCommunityTrip ? (
                    /* Community trip: Join Request Form */
                    <JoinRequestForm
                      packageId={package_.id}
                      packageTitle={package_.title}
                      packageSlug={package_.slug}
                      pricePerPersonPaise={package_.price_paise}
                      hostName={hostData?.full_name || hostData?.username || 'the host'}
                      joinPreferences={package_.join_preferences}
                      existingRequest={existingRequest}
                      isHost={isHost}
                      isLoggedIn={!!user}
                    />
                  ) : (
                    /* UnSOLO trip: Standard booking flow */
                    <>
                      <div>
                        <span className="text-3xl font-black text-primary">{formatPrice(package_.price_paise)}</span>
                        <span className="text-muted-foreground text-sm ml-2">per person</span>
                      </div>

                      {user ? (
                        <BookingFormClient
                          packageId={package_.id}
                          packageSlug={package_.slug}
                          pricePerPersonPaise={package_.price_paise}
                          maxGroupSize={package_.max_group_size}
                          packageTitle={package_.title}
                          departureDates={package_.departure_dates}
                          returnDates={package_.return_dates}
                          durationDays={package_.duration_days}
                          groupInvite={groupInvite}
                          availableSlots={availableSlotsMap}
                        />
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">Sign in to book this trip</p>
                          <Button className="w-full bg-primary text-black font-bold hover:bg-primary/90" asChild>
                            <Link href={`/login?redirectTo=/packages/${package_.slug}`}>
                              Sign In to Book
                            </Link>
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  <div className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span className="text-foreground">{packageDurationShortLabel(package_)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location</span>
                      <span className="text-foreground">{package_.destination?.state}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Group</span>
                      <span className="text-foreground">{package_.max_group_size} people</span>
                    </div>
                    {isCommunityTrip && hostData && (
                      <div className="flex justify-between">
                        <span>Hosted by</span>
                        <Link href={`/profile/${hostData.username}`} className="text-primary hover:underline">
                          {hostData.full_name || hostData.username}
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
