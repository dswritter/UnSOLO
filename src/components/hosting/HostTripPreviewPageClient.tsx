'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, MapPin, Users } from 'lucide-react'
import { ImageGallery } from '@/components/packages/ImageGallery'
import { formatPrice, formatDate } from '@/lib/utils'
import { TripDurationStatCard } from '@/components/packages/TripDurationStatCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'
import {
  TRIP_PREVIEW_HANDOFF_KEY,
  TRIP_PREVIEW_SESSION_KEY,
  type HostTripPreviewPayload,
} from '@/lib/host-trip-preview-session'
import {
  minPricePaiseFromVariants,
  priceVariantsFromFormRows,
  type PriceVariant,
} from '@/lib/package-pricing'

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  challenging: 'Challenging',
}

const GENDER_LABELS: Record<string, string> = {
  women: 'Women only',
  men: 'Men only',
  all: 'All genders welcome',
}

function buildPricing(data: HostTripPreviewPayload): {
  minPaise: number
  tiers: PriceVariant[] | null
} {
  if (data.priceRows.length >= 2) {
    try {
      const rows = data.priceRows.map((r) => ({
        pricePaise: Math.round(parseFloat(r.rupees || '0') * 100),
        facilities: r.facilities,
      }))
      const tiers = priceVariantsFromFormRows(rows)
      if (tiers) {
        return { minPaise: minPricePaiseFromVariants(tiers), tiers }
      }
    } catch {
      /* fall through */
    }
    const amounts = data.priceRows
      .map((r) => Math.round(parseFloat(r.rupees || '0') * 100))
      .filter((n) => Number.isFinite(n) && n >= 100)
    const minPaise = amounts.length ? Math.min(...amounts) : 0
    return { minPaise, tiers: null }
  }
  const p = Math.round(parseFloat(data.priceRows[0]?.rupees || '0') * 100)
  return { minPaise: Number.isFinite(p) && p >= 100 ? p : 0, tiers: null }
}

export function HostTripPreviewPageClient() {
  const [data, setData] = useState<HostTripPreviewPayload | null | undefined>(undefined)

  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem(TRIP_PREVIEW_HANDOFF_KEY) ||
            sessionStorage.getItem(TRIP_PREVIEW_SESSION_KEY)
          : null
      if (!raw) {
        setData(null)
        return
      }
      setData(JSON.parse(raw) as HostTripPreviewPayload)
    } catch {
      setData(null)
    }
  }, [])

  const schedulePairs = useMemo(() => {
    if (data == null || typeof data !== 'object') return []
    return (data.scheduleRows || []).filter((r) => r.dep && r.ret)
  }, [data])

  const { minPaise, tiers } = useMemo(() => {
    if (!data) return { minPaise: 0, tiers: null as PriceVariant[] | null }
    return buildPricing(data)
  }, [data])

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading preview…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <p className="text-center text-muted-foreground">
          No preview data found. Use <strong>Preview</strong> from the create or edit trip form.
        </p>
        <Button asChild variant="outline">
          <Link href="/host">Back to host dashboard</Link>
        </Button>
      </div>
    )
  }

  const td = Math.max(1, parseInt(data.tripDays, 10) || 1)
  const tn = Math.max(0, parseInt(data.tripNights, 10) || 0)
  const durationDisplay = {
    duration_days: td,
    trip_days: td,
    trip_nights: tn,
    exclude_first_day_travel: data.excludeFirstTravel,
    departure_time: data.departureTime,
    return_time: data.returnTime,
  }

  const destLine = data.destination ? `${data.destination.name}, ${data.destination.state}` : null
  const maxGroup = parseInt(data.maxGroupSize, 10) || 12

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
        <span className="font-medium">Trip preview</span>
        <span className="text-amber-200/90"> — how your listing can look to travelers (booking disabled).</span>
        {data.livePackageSlug ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            <Link
              href={`/packages/${data.livePackageSlug}`}
              className="underline decoration-amber-500/50 underline-offset-2 hover:text-primary"
            >
              Open saved public listing
            </Link>{' '}
            <span className="opacity-80">(reflects last saved version, not unsaved edits)</span>
          </span>
        ) : null}
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6 gap-1.5 text-muted-foreground" asChild>
          <Link href="/host">
            <ArrowLeft className="h-4 w-4" />
            Host dashboard
          </Link>
        </Button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ImageGallery images={data.images || []} title={data.title || 'Trip'} />

            <div>
              <h1 className="text-3xl font-black tracking-tight">{data.title || 'Untitled trip'}</h1>
              {data.shortDescription ? (
                <p className="mt-2 text-lg text-muted-foreground">{data.shortDescription}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {destLine ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    {destLine}
                  </span>
                ) : null}
                <Badge variant="outline" className="capitalize">
                  {DIFFICULTY_LABEL[data.difficulty] || data.difficulty}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <TripDurationStatCard duration={durationDisplay} />
              {[{ icon: Users, label: 'Group size', value: `Up to ${maxGroup}` }].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
                  <Icon className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <div className="text-sm font-bold leading-tight">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <Users className="mx-auto mb-1 h-5 w-5 text-primary" />
                <div className="text-sm font-bold leading-tight">New</div>
                <div className="text-xs text-muted-foreground">Reviews</div>
              </div>
            </div>

            {schedulePairs.length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-3 text-lg font-bold">Offered departures</h2>
                <ul className="space-y-2 text-sm">
                  {schedulePairs.map((p, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-1 border-b border-border/40 py-2 last:border-0 sm:flex-row sm:justify-between"
                    >
                      <span>
                        <span className="text-muted-foreground">Departs </span>
                        <span className="font-medium">{formatDate(p.dep)}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Returns </span>
                        <span className="font-medium">{formatDate(p.ret)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-3 text-xl font-bold">About this trip</h2>
              {data.description?.trim() ? (
                <TripDescriptionDisplay className="text-muted-foreground">
                  {data.description}
                </TripDescriptionDisplay>
              ) : (
                <p className="text-muted-foreground">No description yet.</p>
              )}
            </div>

            {data.selectedIncludes?.length ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-xl font-bold">What&apos;s included</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.selectedIncludes.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(data.genderPreference && data.genderPreference !== 'all') ||
            data.minTripsCompleted ||
            (data.interestTags && data.interestTags.length > 0) ||
            data.minAge ||
            data.maxAge ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-3 text-lg font-bold">Who can join</h2>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {data.genderPreference && data.genderPreference !== 'all' ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        {GENDER_LABELS[data.genderPreference] || data.genderPreference}
                      </span>
                    </div>
                  ) : null}
                  {data.minAge || data.maxAge ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Age {data.minAge || '—'}–{data.maxAge || '—'}
                      </span>
                    </div>
                  ) : null}
                  {data.minTripsCompleted ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Min {data.minTripsCompleted} completed trips
                      </span>
                    </div>
                  ) : null}
                  {data.interestTags && data.interestTags.length > 0 ? (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Interests: {data.interestTags.join(', ')}
                      </span>
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Payment:{' '}
                  {data.paymentTiming === 'pay_on_booking'
                    ? 'Book & pay after choosing dates'
                    : 'Request to join, then pay if approved'}
                </p>
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-20">
              <Card className="border-border bg-card">
                <CardContent className="space-y-4 p-6">
                  <div>
                    {tiers && tiers.length >= 2 ? (
                      <>
                        <p className="text-xs font-medium text-muted-foreground">From</p>
                        <span className="text-3xl font-black text-primary">{formatPrice(minPaise)}</span>
                        <span className="ml-2 text-sm text-muted-foreground">per person</span>
                        <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                          {tiers.map((t) => (
                            <li key={t.description} className="flex justify-between gap-2">
                              <span className="text-muted-foreground line-clamp-2">{t.description}</span>
                              <span className="shrink-0 font-medium tabular-nums">{formatPrice(t.price_paise)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-black text-primary">
                          {minPaise >= 100 ? formatPrice(minPaise) : '—'}
                        </span>
                        <span className="ml-2 text-sm text-muted-foreground">per person</span>
                      </>
                    )}
                  </div>
                  <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                    Preview only — travelers will see booking or join options on the live trip page.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
