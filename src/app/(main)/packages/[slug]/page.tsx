export const revalidate = 300 // 5 minutes

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Users, CheckCircle, Star, ArrowLeft, ShieldCheck, Award } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { TripDurationStatCard } from '@/components/packages/TripDurationStatCard'
import { hasTieredPricing } from '@/lib/package-pricing'
import Link from 'next/link'
import { ImageGallery } from '@/components/packages/ImageGallery'
import { BookingFormClient } from '@/components/packages/BookingFormClient'
import { JoinRequestForm } from '@/components/hosting/JoinRequestForm'
import { InterestButton } from '@/components/packages/InterestButton'
import { ShareButton } from '@/components/packages/ShareButton'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'
import { getInterestData } from '@/actions/booking'
import { RelatedServicesSection } from '@/components/packages/RelatedServicesSection'
import { ReviewsSection } from '@/components/reviews/ReviewsSection'
import type { Package, HostProfile, JoinPreferences } from '@/types'
import { isCommunityDirectCheckout, isTokenDepositEnabled } from '@/lib/join-preferences'

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
  const jp = package_.join_preferences
  const communityDirectCheckout = isCommunityTrip && isCommunityDirectCheckout(jp ?? undefined)
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
  let groupInvite: { id: string; travel_date: string; organizer_name: string; per_person_paise: number } | null = null
  if (groupId && !isCommunityTrip) {
    const { data: gData } = await supabase
      .from('group_bookings')
      .select('id, travel_date, per_person_paise, organizer:profiles!group_bookings_organizer_id_fkey(full_name, username)')
      .eq('id', groupId)
      .eq('status', 'open')
      .single()
    if (gData) {
      const org = gData.organizer as unknown as { full_name: string | null; username: string }
      groupInvite = {
        id: gData.id,
        travel_date: gData.travel_date,
        per_person_paise: gData.per_person_paise,
        organizer_name: org?.full_name || org?.username || 'Someone',
      }
    }
  }

  // Calculate available slots (UnSOLO trips, or community trips with immediate checkout)
  const availableSlotsMap: Record<string, number> = {}
  if (!isCommunityTrip || communityDirectCheckout) {
    if (package_.departure_dates && package_.max_group_size) {
      const closedDates = new Set(
        (package_.departure_dates_closed || []).map(tripDepartureDateKey),
      )
      for (const date of package_.departure_dates) {
        const { data: dateBookings } = await supabase
          .from('bookings')
          .select('guests')
          .eq('package_id', pkg.id)
          .eq('travel_date', date)
          .in('status', ['pending', 'confirmed', 'completed'])
        const totalBooked = (dateBookings || []).reduce((sum, b) => sum + (b.guests || 1), 0)
        let slots = Math.max(0, package_.max_group_size - totalBooked)
        if (closedDates.has(tripDepartureDateKey(date))) slots = 0
        availableSlotsMap[date] = slots
      }
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
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight">{package_.title}</h1>
                <div className="flex flex-wrap gap-2 md:flex-shrink-0 md:mt-1">
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
                priceLinePrefix={hasTieredPricing(package_.price_variants) ? 'From ' : ''}
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
              <TripDurationStatCard duration={package_} />
              {[
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
              {package_.description?.trim() ? (
                <TripDescriptionDisplay className="text-muted-foreground">{package_.description}</TripDescriptionDisplay>
              ) : (
                <p className="text-muted-foreground text-sm">No description yet.</p>
              )}
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

            {/* Related Services - Cross-Sell */}
            {package_.destination?.name && (
              <div className="bg-card border border-border rounded-xl p-6">
                <RelatedServicesSection
                  packageId={package_.id}
                  destinationId={package_.destination_id}
                  destinationName={package_.destination.name}
                />
              </div>
            )}

            {/* Reviews */}
            <ReviewsSection
              reviews={reviews || []}
              averageRating={avgRating}
              averageDestination={avgDest}
              averageExperience={avgExp}
              currentUserId={user?.id || null}
            />
          </div>

          {/* Sidebar - Booking / Join */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-4">
                  {isCommunityTrip ? (
                    communityDirectCheckout ? (
                      isHost ? (
                        <div className="space-y-4">
                          <div>
                            <span className="text-3xl font-black text-primary">
                              {hasTieredPricing(package_.price_variants) ? 'From ' : ''}
                              {formatPrice(package_.price_paise)}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">per person</span>
                          </div>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
                            You are the host of this trip. Travelers can book and pay directly for this listing.
                          </div>
                          <Button className="w-full font-bold" variant="outline" asChild>
                            <Link href="/host">Go to Host Dashboard</Link>
                          </Button>
                        </div>
                      ) : user ? (
                        <>
                          <div>
                            <span className="text-3xl font-black text-primary">
                              {hasTieredPricing(package_.price_variants) ? 'From ' : ''}
                              {formatPrice(package_.price_paise)}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">per person</span>
                          </div>
                          <BookingFormClient
                            packageId={package_.id}
                            packageSlug={package_.slug}
                            pricePerPersonPaise={package_.price_paise}
                            priceVariants={package_.price_variants}
                            maxGroupSize={package_.max_group_size}
                            packageTitle={package_.title}
                            departureDates={package_.departure_dates}
                            returnDates={package_.return_dates}
                            durationDays={package_.trip_days ?? package_.duration_days}
                            groupInvite={null}
                            availableSlots={availableSlotsMap}
                            tokenBooking={
                              isTokenDepositEnabled(jp ?? undefined) &&
                              typeof jp?.token_amount_paise === 'number'
                                ? { tokenAmountPaisePerPerson: jp.token_amount_paise }
                                : null
                            }
                          />
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <span className="text-3xl font-black text-primary">
                              {hasTieredPricing(package_.price_variants) ? 'From ' : ''}
                              {formatPrice(package_.price_paise)}
                            </span>
                            <span className="text-muted-foreground text-sm ml-2">per person</span>
                          </div>
                          <p className="text-sm text-muted-foreground">Sign in to book this trip</p>
                          <Button className="w-full bg-primary text-black font-bold hover:bg-primary/90" asChild>
                            <Link href={`/login?redirectTo=/packages/${package_.slug}`}>
                              Sign In to Book
                            </Link>
                          </Button>
                        </div>
                      )
                    ) : (
                      <JoinRequestForm
                        packageId={package_.id}
                        packageTitle={package_.title}
                        packageSlug={package_.slug}
                        pricePerPersonPaise={package_.price_paise}
                        priceLinePrefix={hasTieredPricing(package_.price_variants) ? 'From ' : ''}
                        hostName={hostData?.full_name || hostData?.username || 'the host'}
                        joinPreferences={package_.join_preferences}
                        existingRequest={existingRequest}
                        isHost={isHost}
                        isLoggedIn={!!user}
                      />
                    )
                  ) : (
                    /* UnSOLO trip: Standard booking flow */
                    <>
                      <div>
                        <span className="text-3xl font-black text-primary">
                          {hasTieredPricing(package_.price_variants) ? 'From ' : ''}
                          {formatPrice(package_.price_paise)}
                        </span>
                        <span className="text-muted-foreground text-sm ml-2">per person</span>
                      </div>

                      {user ? (
                        <BookingFormClient
                          packageId={package_.id}
                          packageSlug={package_.slug}
                          pricePerPersonPaise={package_.price_paise}
                          priceVariants={package_.price_variants}
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
