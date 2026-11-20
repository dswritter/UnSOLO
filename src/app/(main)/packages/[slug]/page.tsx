export const revalidate = 300 // 5 minutes

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { getCachedPublicPackageDetail, PACKAGE_DETAIL_SELECT } from '@/lib/packages/public-package-cache'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Users, CheckCircle, Star, ArrowLeft, ShieldCheck, Award, Mountain, CalendarDays, Clock } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import Link from 'next/link'
import { ImageGallery } from '@/components/packages/ImageGallery'
import { BookingFormClient } from '@/components/packages/BookingFormClient'
import { JoinRequestForm } from '@/components/hosting/JoinRequestForm'
// InterestButton pulls in framer-motion (~41 KB gz). Lazy-load it via a
// client-component wrapper — `ssr: false` is only allowed in Client Components
// and this page is a Server Component.
import { LazyInterestButton as InterestButton } from '@/components/packages/LazyInterestButton'
import { ShareButton } from '@/components/packages/ShareButton'
import { InterestedAvatars } from '@/components/packages/InterestedAvatars'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'
import { getInterestData } from '@/actions/booking'
import { getSupportWhatsappNumber, resolveWhatsappNumber } from '@/lib/platform-settings'
import { RelatedServicesSection } from '@/components/packages/RelatedServicesSection'
import { ReviewsSection } from '@/components/reviews/ReviewsSection'
import { JoinTripPanel } from '@/components/trip-claims/JoinTripPanel'
import type { Package, HostProfile } from '@/types'
import { isCommunityDirectCheckout, isTokenDepositEnabled } from '@/lib/join-preferences'
import { APP_URL } from '@/lib/constants'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { demoPackage } from '@/lib/packages/demo-package'
import { getUnlinkedHost } from '@/lib/listings/unlinked-host'
import { hostProfileHref } from '@/lib/profile/host-profile'
import { TripMeetingPoint } from '@/components/hosting/TripMeetingPoint'
import { TripCircle, TripTribeSection } from '@/components/tribe/TripTribeSection'
import { nextDeparture, type UserLite } from '@/lib/tribe/models'
import { dateRange } from '@/components/tribe/format'

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', moderate: 'Moderate', challenging: 'Challenging' }

const GENDER_LABELS: Record<string, string> = {
  women: 'Women only',
  men: 'Men only',
  all: 'All genders welcome',
}

function HostProfileLink({ host, className, children }: { host: HostProfile & { profileHref?: string }; className?: string; children: React.ReactNode }) {
  const href = hostProfileHref(host)
  if (!href) return <span className={className}>{children}</span>
  return <Link href={href} className={className}>{children}</Link>
}

function toAbsoluteUrl(value: string | null | undefined) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `${APP_URL.replace(/\/$/, '')}/${value.replace(/^\//, '')}`
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || ''
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const cached = await getCachedPublicPackageDetail(slug)
  const pkg = (cached as Pick<Package, 'title' | 'slug' | 'description' | 'short_description' | 'images'> & { destination?: unknown } | null)
    ?? (await (await getRequestAuth()).supabase
      .from('packages')
      .select('title, slug, description, short_description, images, destination:destinations(name)')
      .eq('slug', slug)
      .maybeSingle()).data

  if (!pkg) {
    return {}
  }

  const packageTitle = pkg.title || 'Trip'
  const destinationName =
    (pkg.destination as { name?: string | null } | null)?.name?.trim() || ''
  const title = destinationName ? `${packageTitle} | ${destinationName} | UnSOLO` : `${packageTitle} | UnSOLO`
  const description =
    cleanText(pkg.short_description) ||
    cleanText(pkg.description) ||
    `Discover ${packageTitle} on UnSOLO.`
  const url = `${APP_URL.replace(/\/$/, '')}/packages/${pkg.slug}`
  const imageUrl = toAbsoluteUrl(pkg.images?.[0])

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      images: imageUrl ? [{ url: imageUrl, alt: packageTitle }] : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
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
  const [{ supabase, user }, cachedPkg] = await Promise.all([getRequestAuth(), getCachedPublicPackageDetail(slug)])

  // Hosts see fresh data for their own trip; admins/hosts can also open inactive trips.
  const profilePromise = user ? getRequestProfile(user.id) : Promise.resolve(null)
  let pkg = cachedPkg as (Package & { host: unknown }) | null
  if (!pkg || (user && pkg.host_id === user.id)) {
    const { data: fresh, error: freshError } = await supabase.from('packages').select(PACKAGE_DETAIL_SELECT).eq('slug', slug).maybeSingle()
    pkg = (fresh as (Package & { host: unknown }) | null) ?? pkg ?? demoPackage(slug, freshError)
    if (!pkg) notFound()
    const isAdminUser = (await profilePromise)?.role === 'admin'
    if (!pkg.is_active && !isAdminUser && !(user && pkg.host_id === user.id)) {
      notFound()
    }
  }

  const package_ = pkg as Package
  // Staff-created trips awaiting their host's account still present as community trips.
  const isUnlinkedHost = !package_.host_id && !!package_.created_on_behalf_by
  const isCommunityTrip = !!package_.host_id || isUnlinkedHost
  const jp = package_.join_preferences
  // No host account yet to approve join requests, so travellers book directly.
  const communityDirectCheckout = isCommunityTrip && (isUnlinkedHost || isCommunityDirectCheckout(jp ?? undefined))
  const hostDataPromise: Promise<HostProfile | null> = isUnlinkedHost
    ? getUnlinkedHost('trip', package_.id)
    : Promise.resolve((pkg.host as unknown as HostProfile) || null)
  const isHost = !!user && !!package_.host_id && user.id === package_.host_id
  const compareAtDisplayPaise = hasTieredPricing(package_.price_variants)
    ? ((package_.price_variants || [])
        .filter(
          (variant): variant is NonNullable<Package['price_variants']>[number] & { compare_at_paise: number } =>
            typeof variant.compare_at_paise === 'number' &&
            Number.isFinite(variant.compare_at_paise) &&
            variant.compare_at_paise > variant.price_paise &&
            variant.price_paise === package_.price_paise,
        )
        .reduce<number | null>((highest, variant) => {
          if (highest == null) return variant.compare_at_paise
          return Math.max(highest, variant.compare_at_paise)
        }, null))
    : typeof package_.compare_at_price_paise === 'number' &&
        Number.isFinite(package_.compare_at_price_paise) &&
        package_.compare_at_price_paise > package_.price_paise
      ? package_.compare_at_price_paise
      : null

  const shouldLoadJoinRequest = isCommunityTrip && !!user && !isHost
  const shouldLoadGroupInvite = !!groupId && !isCommunityTrip

  // Fan out all remaining independent reads in parallel so the waterfall
  // collapses to a single round-trip (booking counts for all dates in one query).
  const computeSlots = !isCommunityTrip || communityDirectCheckout
  const shouldLoadSlots =
    computeSlots && !!package_.departure_dates && !!package_.max_group_size

  // Does this viewer already have full access to the trip (own completed booking,
  // or an approved companion claim), or a claim already pending? Drives whether
  // the "write a review / join this trip" panel shows at all, and which state.
  const checkJoinEligibility = !!user && !isHost
  const [
    reviewsRes,
    interestData,
    supportWhatsappNumber,
    interestedRowsRes,
    similarRes,
    dateBookingResults,
    ownCompletedBookingRes,
    myClaimRes,
    joinRequestRes,
    groupInviteRes,
  ] = await Promise.all([
    supabase
      .from('reviews')
      .select('*, user:profiles(username, full_name, avatar_url)')
      .eq('package_id', pkg.id)
      .order('created_at', { ascending: false })
      .limit(5),
    getInterestData(pkg.id),
    getSupportWhatsappNumber(),
    supabase
      .from('package_interests')
      .select('user:profiles(id, username, full_name, avatar_url)')
      .eq('package_id', pkg.id)
      .limit(5),
    package_.destination_id
      ? supabase
          .from('packages')
          .select('id, title, slug, price_paise, images, duration_days, difficulty')
          .eq('destination_id', package_.destination_id)
          .eq('is_active', true)
          .neq('id', package_.id)
          .limit(3)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; slug: string; price_paise: number; images: string[] | null; duration_days: number; difficulty: string }> }),
    shouldLoadSlots
      ? supabase
          .from('bookings')
          .select('travel_date, guests')
          .eq('package_id', pkg.id)
          .in('travel_date', package_.departure_dates || [])
          .in('status', ['pending', 'confirmed', 'completed'])
          .then(({ data }) => (package_.departure_dates || []).map(date => ({
            date,
            rows: (data || []).filter(row => tripDepartureDateKey(row.travel_date) === tripDepartureDateKey(date)),
          })))
      : Promise.resolve([] as { date: string; rows: { guests: number | null }[] }[]),
    checkJoinEligibility
      ? supabase.from('bookings').select('id').eq('package_id', pkg.id).eq('user_id', user!.id).eq('status', 'completed').limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    checkJoinEligibility
      ? supabase.from('trip_traveller_claims').select('status').eq('package_id', pkg.id).eq('claimant_id', user!.id).maybeSingle()
      : Promise.resolve({ data: null }),
    shouldLoadJoinRequest
      ? supabase
          .from('join_requests')
          .select('id, status, message, host_response, payment_deadline')
          .eq('trip_id', package_.id)
          .eq('user_id', user!.id)
          .single()
      : Promise.resolve({ data: null }),
    shouldLoadGroupInvite
      ? supabase
          .from('group_bookings')
          .select('id, travel_date, per_person_paise, organizer:profiles!group_bookings_organizer_id_fkey(full_name, username)')
          .eq('id', groupId!)
          .eq('status', 'open')
          .single()
      : Promise.resolve({ data: null }),
  ])

  const isAdminUser = (await profilePromise)?.role === 'admin'
  const hostData = await hostDataPromise
  const existingRequest = (joinRequestRes.data || null) as
    | { id: string; status: 'pending' | 'approved' | 'rejected'; message: string | null; host_response: string | null; payment_deadline: string | null }
    | null

  let groupInvite: { id: string; travel_date: string; organizer_name: string; per_person_paise: number } | null = null
  if (groupInviteRes.data) {
    const gData = groupInviteRes.data
    const org = gData.organizer as unknown as { full_name: string | null; username: string }
    groupInvite = {
      id: gData.id,
      travel_date: gData.travel_date,
      per_person_paise: gData.per_person_paise,
      organizer_name: org?.full_name || org?.username || 'Someone',
    }
  }

  const joinEligibility: 'can_claim' | 'pending' | null = (() => {
    if (!checkJoinEligibility) return null
    if (ownCompletedBookingRes?.data) return null // already has their own booking
    const claimStatus = (myClaimRes?.data as { status?: string } | null)?.status
    if (claimStatus === 'approved') return null // already has full access
    if (claimStatus === 'pending') return 'pending'
    return 'can_claim' // none yet, or previously denied (can resubmit)
  })()

  const reviews = reviewsRes.data
  const avgRating = reviews?.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0
  const avgDest = reviews?.length
    ? reviews.reduce((sum, r) => sum + (r.rating_destination || r.rating), 0) / reviews.length
    : 0
  const avgExp = reviews?.length
    ? reviews.reduce((sum, r) => sum + (r.rating_experience || r.rating), 0) / reviews.length
    : 0

  const whatsappNumber = resolveWhatsappNumber(package_.whatsapp_number, supportWhatsappNumber)
  const interestedUsers = (interestedRowsRes.data || [])
    .map(r => r.user as unknown as { id: string; username: string; full_name: string | null; avatar_url: string | null } | null)
    .filter(Boolean) as { id: string; username: string; full_name: string | null; avatar_url: string | null }[]

  const similarPackages = (similarRes.data || []) as Array<{ id: string; title: string; slug: string; price_paise: number; images: string[] | null; duration_days: number; difficulty: string }>

  const availableSlotsMap: Record<string, number> = {}
  if (shouldLoadSlots) {
    const closedDates = new Set(
      (package_.departure_dates_closed || []).map(tripDepartureDateKey),
    )
    const cutoffs = (package_.booking_cutoff_dates || {}) as Record<string, string>
    const nowMs = Date.now()
    for (const { date, rows } of dateBookingResults) {
      const totalBooked = rows.reduce((sum, b) => sum + (b.guests || 1), 0)
      let slots = Math.max(0, package_.max_group_size - totalBooked)
      const dateKey = tripDepartureDateKey(date)
      if (closedDates.has(dateKey)) slots = 0
      const cutoffIso = cutoffs[dateKey]
      if (cutoffIso) {
        const cutoffEnd = new Date(cutoffIso)
        cutoffEnd.setHours(23, 59, 59, 999)
        if (nowMs > cutoffEnd.getTime()) slots = 0
      }
      availableSlotsMap[date] = slots
    }
  }

  // Trip-level pause: still visible but not bookable.
  const bookingsPaused = !!package_.bookings_paused

  // Lowest non-zero spot count across open dates — useful as a "filling fast"
  // nudge next to the interest heart. Only show if genuinely scarce (1–3).
  const openSlotCounts = Object.values(availableSlotsMap).filter(n => n > 0)
  const scarceSlotsLeft = openSlotCounts.length > 0 ? Math.min(...openSlotCounts) : null
  const showScarcePill = scarceSlotsLeft !== null && scarceSlotsLeft <= 3

  const wanderBackHref = isCommunityTrip
    ? '/wander?search=1&tab=trips&tripSource=community'
    : '/wander?search=1&tab=trips'

  const coverImage = package_.images?.[0] ?? null
  const ringHost: UserLite | null = hostData
    ? {
        id: hostData.id, username: hostData.username, name: hostData.full_name || hostData.username || 'Host',
        avatarUrl: hostData.avatar_url ? storageThumbnailUrl(hostData.avatar_url) || hostData.avatar_url : null,
        isPhoneVerified: false, isIdVerified: !!hostData.is_verified, isHost: true,
      }
    : null
  const nextDep = nextDeparture(package_.departure_dates)
  const priceLabel = `${hasTieredPricing(package_.price_variants) ? 'From ' : ''}${formatPrice(package_.price_paise)}`
  const placeLine = [package_.destination?.name, package_.destination?.state].filter(Boolean).join(', ')
  const hostName = hostData ? hostData.full_name || hostData.username : null
  const circleProps = { packageId: package_.id, departureDates: package_.departure_dates ?? null, maxGroupSize: package_.max_group_size ?? null, host: ringHost, photo: coverImage ? storageThumbnailUrl(coverImage) || coverImage : null }
  const facts = (
    <div className="flex flex-wrap gap-2">
      {nextDep && <span className="pc-chip pointer-events-none"><CalendarDays className="h-4 w-4" aria-hidden />{dateRange(nextDep, null)}</span>}
      <span className="pc-chip pointer-events-none"><Clock className="h-4 w-4" aria-hidden />{packageDurationShortLabel(package_)}</span>
      {package_.difficulty && <span className="pc-chip pointer-events-none"><Mountain className="h-4 w-4" aria-hidden />{DIFFICULTY_LABEL[package_.difficulty] ?? package_.difficulty}</span>}
      {package_.max_group_size ? <span className="pc-chip pointer-events-none"><Users className="h-4 w-4" aria-hidden />Up to {package_.max_group_size}</span> : null}
      {avgRating ? <span className="pc-chip pointer-events-none"><Star className="h-4 w-4" aria-hidden />{avgRating.toFixed(1)} · {reviews?.length} reviews</span> : null}
    </div>
  )

  return (
    <div className="relative min-h-screen">
      {/* Mobile: full-bleed cover with round back/share; the seat ring overlaps its bottom edge. */}
      <div className="relative md:hidden">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[color:var(--pc-tonal)]">
          {coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverImage} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute inset-x-4 top-3 flex items-center justify-between">
            <Link href={wanderBackHref} aria-label="Back" className="pc-glassbtn"><ArrowLeft className="h-5 w-5" aria-hidden /></Link>
            <div className="flex items-center gap-2">
              <span className="fc-glass-interest"><InterestButton packageId={package_.id} initialCount={interestData.count} initialInterested={interestData.isInterested} isLoggedIn={!!user} /></span>
              <ShareButton slug={package_.slug} title={package_.title} location={placeLine} pricePaise={package_.price_paise}
                priceLinePrefix={hasTieredPricing(package_.price_variants) ? 'From ' : ''} durationSummary={packageDurationShortLabel(package_)} whatsappNumber={whatsappNumber} variant="glass" />
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="h-24" />}>
          <TripCircle {...circleProps} size={196} className="relative -mt-[104px] px-4" heading={
            <div className="mt-2 text-center">
              <h1 className="text-[28px] leading-[1.1]">{package_.title}</h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">
                {placeLine}{hostName ? <> · hosted by <span className="font-semibold text-foreground">{hostName}</span></> : null}
                {hostData?.is_verified && <ShieldCheck className="ml-1 inline h-4 w-4 text-[color:var(--pc-pine)]" aria-label="Verified host" />}
              </p>
            </div>
          } />
        </Suspense>
      </div>

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:px-6 md:pt-8 md:pb-16 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 hidden items-center gap-2 text-sm font-semibold text-muted-foreground md:flex">
          <Link href={wanderBackHref} className="pc-iconbtn -ml-2" aria-label="Back to Explore"><ArrowLeft className="h-5 w-5" aria-hidden /></Link>
          <Link href="/" className="hover:text-foreground">Explore</Link><span aria-hidden>/</span>
          {package_.destination?.state && <><span>{package_.destination.state}</span><span aria-hidden>/</span></>}
          <span className="truncate text-foreground">{package_.title}</span>
        </nav>

        {/* Edits-under-review banner: shown to the public when the host recently
            updated a previously-approved trip and an admin is re-reviewing.
            Bookings stay open throughout (see `createBookingOrder`). */}
        {isCommunityTrip
          && package_.moderation_status === 'pending'
          && package_.first_approved_at
          && !isHost
          && !isAdminUser && (
          <div className="mb-4 rounded-2xl border border-[color:var(--pc-gold)] bg-[color:var(--pc-gold-bg)] px-4 py-2.5 text-sm">
            Recent host edits are under review. Booking stays open.
          </div>
        )}

        <div className="mb-6 md:hidden">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-hide [&>div]:flex-nowrap">{facts}</div>
          {showScarcePill && <p className="mt-3"><span className="pc-tag pc-tag-women">Only {scarceSlotsLeft} left</span></p>}
          <div className="mt-2"><TripMeetingPoint point={package_.metadata?.meeting_point} address={package_.metadata?.meeting_address} /></div>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Desktop: title, host and facts above the photos */}
            <div className="hidden md:block">
              <div className="flex flex-wrap items-center gap-2">
                {hostData?.is_verified && <span className="pc-tag pc-tag-verified"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Verified host</span>}
                {isCommunityTrip ? <span className="pc-tag pc-tag-hosted">Community trip</span> : <span className="pc-tag pc-tag-hosted">UnSOLO trip</span>}
                {showScarcePill && <span className="pc-tag pc-tag-women">Only {scarceSlotsLeft} left</span>}
              </div>
              <h1 className="pc-display mt-3 text-[44px] leading-[1.02]">{package_.title}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-[17px] text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden />{placeLine}
                {hostName && <> · hosted by <span className="font-semibold text-foreground">{hostName}</span></>}
              </p>
              <TripMeetingPoint point={package_.metadata?.meeting_point} address={package_.metadata?.meeting_address} />
              <div className="mt-4">{facts}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <InterestedAvatars packageId={package_.id} totalCount={interestData.count} preview={interestedUsers} />
                <div className="flex items-center gap-2">
                  <InterestButton packageId={package_.id} initialCount={interestData.count} initialInterested={interestData.isInterested} isLoggedIn={!!user} />
                  <ShareButton slug={package_.slug} title={package_.title} location={placeLine} pricePaise={package_.price_paise}
                  priceLinePrefix={hasTieredPricing(package_.price_variants) ? 'From ' : ''} durationSummary={packageDurationShortLabel(package_)} whatsappNumber={whatsappNumber} />
                </div>
              </div>
            </div>

            <div className="fc-gallery overflow-hidden rounded-[28px]">
              <ImageGallery images={package_.images || []} title={package_.title} />
            </div>

            <Suspense fallback={null}>
              <TripTribeSection
                packageId={package_.id}
                placeName={(package_ as unknown as { destination?: { name?: string } | null }).destination?.name ?? null}
              />
            </Suspense>

            <nav aria-label="Trip sections" className="sticky top-0 z-20 -mx-4 flex gap-6 overflow-x-auto border-b border-border bg-[color:var(--pc-paper)]/95 px-4 backdrop-blur-md scrollbar-hide md:top-16 md:mx-0 md:px-0">
              {[
                ['#about', 'Overview'],
                ...(package_.includes?.length ? [['#included', 'Inclusions']] : []),
                ...(isCommunityTrip && hostData ? [['#host', 'Host']] : []),
                ['#reviews', 'Reviews'],
              ].map(([href, label]) => (
                <a key={href} href={href} className="whitespace-nowrap border-b-[2.5px] border-transparent py-3.5 text-[15px] font-bold text-muted-foreground transition-colors hover:border-[color:var(--pc-pine)] hover:text-foreground">
                  {label}
                </a>
              ))}
            </nav>

            {/* Host profile card (community trips only) */}
            {isCommunityTrip && hostData && (
              <div id="host" className="scroll-mt-20 pc-card p-6">
                <h2 className="text-lg font-bold mb-4">Your Host</h2>
                <div className="flex items-start gap-4">
                  <HostProfileLink host={hostData}>
                    {hostData.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={storageThumbnailUrl(hostData.avatar_url) || hostData.avatar_url}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/20 hover:ring-primary/40 transition-all"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
                        {(hostData.full_name || hostData.username || 'H')[0].toUpperCase()}
                      </div>
                    )}
                  </HostProfileLink>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HostProfileLink host={hostData} className="font-bold text-foreground hover:text-primary transition-colors">
                        {hostData.full_name || hostData.username}
                      </HostProfileLink>
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
                    <p className="mt-3 text-xs text-muted-foreground">
                      The host&apos;s contact number will be shared with you once your booking is completed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Join preferences (community trips only) */}
            {isCommunityTrip && package_.join_preferences && (
              <div className="pc-card p-6">
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

            {/* Description */}
            <div id="about" className="scroll-mt-20 pc-card p-6">
              <h2 className="text-xl font-bold mb-3">About This Trip</h2>
              {package_.description?.trim() ? (
                <TripDescriptionDisplay className="text-muted-foreground">{package_.description}</TripDescriptionDisplay>
              ) : (
                <p className="text-muted-foreground text-sm">No description yet.</p>
              )}
            </div>

            {/* What's Included */}
            {package_.includes && package_.includes.length > 0 && (
              <div id="included" className="scroll-mt-20 pc-card p-6">
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

            {/* Similar Trips */}
            {similarPackages.length > 0 && (
              <div className="pc-card p-6">
                <h2 className="text-lg font-bold mb-4">More trips like this</h2>
                <div className="flex flex-col gap-3">
                  {similarPackages.map(sp => (
                    <a key={sp.id} href={`/packages/${sp.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:bg-secondary/50 rounded-lg p-2 -mx-2 transition-colors">
                      {sp.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={storageThumbnailUrl(sp.images[0]) || sp.images[0]}
                          alt={sp.title}
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                          <Mountain className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{sp.title}</p>
                        <p className="text-xs text-muted-foreground">{sp.duration_days}D · {sp.difficulty} · {formatPrice(sp.price_paise)}/person</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Related Services - Cross-Sell */}
            {package_.destination?.name && (
              <Suspense fallback={null}>
                <RelatedServicesSection
                  packageId={package_.id}
                  destinationId={package_.destination_id}
                  destinationName={package_.destination.name}
                />
              </Suspense>
            )}

            {/* Reviews */}
            <div id="reviews" className="scroll-mt-20">
            <ReviewsSection
              reviews={reviews || []}
              averageRating={avgRating}
              averageDestination={avgDest}
              averageExperience={avgExp}
              currentUserId={user?.id || null}
            />
            </div>
            {joinEligibility && (
              <div className="mt-4">
                <JoinTripPanel packageId={pkg.id} eligibility={joinEligibility} />
              </div>
            )}
          </div>

          {/* Sidebar - Booking / Join */}
          <div className="lg:col-span-1">
            <div id="trip-booking-card" className="scroll-mt-24 lg:sticky lg:top-24">
              <Card className="pc-card gap-0 overflow-hidden py-0 text-card-foreground shadow-none ring-0">
                <Suspense fallback={null}>
                  <TripCircle {...circleProps} size={248} className="hidden border-b border-border px-6 pb-5 pt-7 md:block" />
                </Suspense>
                <CardContent className="p-6 space-y-4">
                  {bookingsPaused && !isHost && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-700 dark:text-amber-200 space-y-1">
                      <p className="font-semibold text-amber-700 dark:text-amber-300">Not accepting bookings right now</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-200/80">The host has temporarily paused new bookings. Check back later or contact the host for details.</p>
                    </div>
                  )}
                  {isCommunityTrip ? (
                    communityDirectCheckout ? (
                      isHost ? (
                        <div className="space-y-4">
                          <div>
                            {compareAtDisplayPaise ? (
                              <div className="text-sm text-muted-foreground line-through">
                                {formatPrice(compareAtDisplayPaise)}
                              </div>
                            ) : null}
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
                          <BookingFormClient
                            packageId={package_.id}
                            packageSlug={package_.slug}
                            pricePerPersonPaise={package_.price_paise}
                            compareAtPricePaise={compareAtDisplayPaise}
                            priceVariants={package_.price_variants}
                            hostId={package_.host_id}
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
                          <Button className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" asChild>
                            <Link href={`/login?redirectTo=/packages/${package_.slug}`}>
                              Sign in to take a seat
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
                        compareAtPricePaise={compareAtDisplayPaise}
                        hostId={package_.host_id}
                        priceLinePrefix={hasTieredPricing(package_.price_variants) ? 'Starting from ' : ''}
                        priceVariants={package_.price_variants}
                        departureDates={package_.departure_dates}
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
                      {user ? (
                        <BookingFormClient
                          packageId={package_.id}
                          packageSlug={package_.slug}
                          pricePerPersonPaise={package_.price_paise}
                          compareAtPricePaise={compareAtDisplayPaise}
                          priceVariants={package_.price_variants}
                          hostId={package_.host_id}
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
                          <Button className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" asChild>
                            <Link href={`/login?redirectTo=/packages/${package_.slug}`}>
                              Sign in to take a seat
                            </Link>
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  <div className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground">
                    <p className="text-foreground pb-1 leading-snug">
                      <Link href="/refund-policy" className="font-semibold text-primary hover:underline">
                        Cancellations &amp; refunds
                      </Link>
                      <span className="text-muted-foreground mx-1.5" aria-hidden>
                        ·
                      </span>
                      <Link href="/terms" className="font-medium text-primary/90 hover:underline">
                        Terms
                      </Link>
                    </p>
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
                        <HostProfileLink host={hostData} className="text-primary hover:underline">
                          {hostData.full_name || hostData.username}
                        </HostProfileLink>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Thumb reach: price + primary action pinned at the bottom (the tab bar is hidden on trip pages). */}
        <div className="pc-actionbar md:hidden">
          <div className="min-w-0 flex-1">
            {compareAtDisplayPaise ? <p className="text-[12px] text-muted-foreground line-through">{formatPrice(compareAtDisplayPaise)}</p> : null}
            <p className="pc-price truncate">{priceLabel}<small>/person</small></p>
            <p className="truncate text-[12.5px] text-muted-foreground">
              {bookingsPaused ? 'Bookings paused' : scarceSlotsLeft === 0 ? 'Full on open dates' : isCommunityTrip && !communityDirectCheckout ? 'Host approves each seat' : nextDep ? `Next: ${dateRange(nextDep, null)}` : ''}
            </p>
          </div>
          {isHost ? (
            <Link href="/host" className="pc-btn pc-btn-outline">Host dashboard</Link>
          ) : !user ? (
            <Link href={`/login?redirectTo=/packages/${package_.slug}`} className="pc-btn">Take a seat</Link>
          ) : (
            <a href="#trip-booking-card" className="pc-btn" aria-disabled={bookingsPaused || undefined}>
              {isCommunityTrip && !communityDirectCheckout ? 'Request a seat' : 'Take a seat'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
