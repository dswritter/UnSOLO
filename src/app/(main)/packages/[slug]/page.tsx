import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Clock, Users, CheckCircle, Star, Mountain, ArrowLeft } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { BookingFormClient } from '@/components/packages/BookingFormClient'
import { InterestButton } from '@/components/packages/InterestButton'
import { getInterestData } from '@/actions/booking'
import type { Package } from '@/types'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  challenging: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!pkg) notFound()

  const package_ = pkg as Package

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

  // Get the auth user
  const { data: { user } } = await supabase.auth.getUser()

  // Get interest data
  const interestData = await getInterestData(pkg.id)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Back */}
        <Link href="/explore" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explore
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero image */}
            <div className="relative h-72 md:h-96 rounded-2xl overflow-hidden bg-secondary">
              {package_.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={package_.images[0]} alt={package_.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Mountain className="h-20 w-20 text-primary/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-6 left-6">
                <div className="flex items-center gap-2 text-sm text-white/80 mb-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {package_.destination?.name}, {package_.destination?.state}
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-white">{package_.title}</h1>
              </div>
              <div className="absolute top-4 right-4 flex gap-2">
                <Badge className={DIFFICULTY_COLORS[package_.difficulty]}>
                  {package_.difficulty}
                </Badge>
              </div>
            </div>

            {/* Interested button */}
            <InterestButton
              packageId={package_.id}
              initialCount={interestData.count}
              initialInterested={interestData.isInterested}
              isLoggedIn={!!user}
            />

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Clock, label: 'Duration', value: `${package_.duration_days} days` },
                { icon: Users, label: 'Group Size', value: `Max ${package_.max_group_size}` },
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
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {(review.user?.full_name || review.user?.username || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{review.user?.full_name || review.user?.username}</div>
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

          {/* Sidebar - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-4">
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
                      durationDays={package_.duration_days}
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

                  <div className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span className="text-white">{package_.duration_days} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location</span>
                      <span className="text-white">{package_.destination?.state}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Group</span>
                      <span className="text-white">{package_.max_group_size} people</span>
                    </div>
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
