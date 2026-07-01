export const revalidate = 300 // 5 minutes

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getServiceListingsByType } from '@/actions/service-listing-discovery'
import {
  getCachedServiceListingDetail,
  getCachedRelatedListings,
  getCachedPublicServiceListingItems,
} from '@/lib/listings/public-listing-cache'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'
import type { ServiceListingType } from '@/types'
import { createClient } from '@/lib/supabase/server'
import { APP_URL } from '@/lib/constants'

const CATEGORY_LABELS: Record<ServiceListingType, string> = {
  stays: 'Stays',
  activities: 'Activities',
  rentals: 'Rentals',
  getting_around: 'Getting Around',
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
  params: Promise<{ type: string; slug: string }>
}): Promise<Metadata> {
  const { type: typeParam, slug } = await params
  const validTypes: ServiceListingType[] = ['stays', 'activities', 'rentals', 'getting_around']
  if (!validTypes.includes(typeParam as ServiceListingType)) {
    return {}
  }

  const supabase = await createClient()
  const { data: listing } = await supabase
    .from('service_listings')
    .select('title, slug, type, location, short_description, description, images')
    .eq('slug', slug)
    .eq('type', typeParam)
    .single()

  if (!listing) {
    return {}
  }

  const categoryLabel = CATEGORY_LABELS[listing.type as ServiceListingType] || 'Listing'
  const title = `${listing.title} | ${categoryLabel} | UnSOLO`
  const description =
    cleanText(listing.short_description) ||
    cleanText(listing.description) ||
    cleanText(listing.location) ||
    `Discover this ${categoryLabel.toLowerCase()} on UnSOLO.`
  const url = `${APP_URL.replace(/\/$/, '')}/listings/${listing.type}/${listing.slug}`
  const imageUrl = toAbsoluteUrl(listing.images?.[0])

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      images: imageUrl ? [{ url: imageUrl, alt: listing.title }] : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export default async function ServiceListingDetailPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>
}) {
  const { type: typeParam, slug } = await params

  // Validate type
  const validTypes: ServiceListingType[] = ['stays', 'activities', 'rentals', 'getting_around']
  if (!validTypes.includes(typeParam as ServiceListingType)) {
    notFound()
  }

  const type = typeParam as ServiceListingType

  try {
    const listing = await getCachedServiceListingDetail(slug)

    if (!listing || listing.type !== type) {
      notFound()
    }

    // `service_listing_items` may not exist yet if migration 049 hasn't been
    // applied. The action swallows the error and returns [] in that case.
    const [items, relatedListings, hostListings] = await Promise.all([
      getCachedPublicServiceListingItems(listing.id),
      getCachedRelatedListings(listing.id, {
        type: listing.type,
        destination_ids: listing.destination_ids,
        tags: listing.tags,
      }, 6),
      listing.host_id ? (async () => {
        const supabase = await createClient()
        // Fetch both service listings and packages from the host
        const [serviceListingsRes, packagesRes] = await Promise.all([
          supabase
            .from('service_listings')
            .select('*')
            .eq('host_id', listing.host_id)
            .eq('is_active', true)
            .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
            .neq('id', listing.id)
            .limit(6),
          supabase
            .from('packages')
            .select('*')
            .eq('host_id', listing.host_id)
            .eq('is_active', true),
        ])
        const serviceListings = (serviceListingsRes.data || []) as any[]
        const packages = (packagesRes.data || []) as any[]
        return [...serviceListings, ...packages].slice(0, 6)
      })() : Promise.resolve([]),
    ])

    const wanderBackHref = `/wander?search=1&tab=${type}`

    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="sticky top-16 z-30 -mx-4 mb-5 border-b border-white/10 bg-zinc-950/94 px-4 py-3 backdrop-blur-xl md:top-0 md:mx-0 md:rounded-2xl md:border md:px-5">
          <Link
            href={wanderBackHref}
            className="flex items-center gap-3 text-white transition-colors hover:text-primary"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/6">
              <ArrowLeft className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-primary/90">
                {CATEGORY_LABELS[type]}
              </span>
              <span className="block truncate text-sm font-bold text-white">{listing.title}</span>
            </span>
          </Link>
        </div>

        {listing.status === 'pending' && listing.first_approved_at && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Recent host edits are under review — booking stays open.
          </div>
        )}

        <ListingDetailClient listing={listing} items={items} host={listing.host ?? null} relatedListings={relatedListings} hostListings={hostListings} />
      </div>
    )
  } catch (error) {
    console.error('Error loading service listing:', error)
    notFound()
  }
}
