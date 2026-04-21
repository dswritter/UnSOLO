'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Star, MapPin, Zap, MessageCircle, User as UserIcon, Package, ExternalLink } from 'lucide-react'
import type { ServiceListing, ServiceListingItem } from '@/types'
import { formatPrice } from '@/types'
import { ListingBookingForm } from './ListingBookingForm'
import { Suspense, useState } from 'react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { startDirectMessage } from '@/actions/profile'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim()
}

type ListingHost = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  host_rating: number | null
  is_verified: boolean
}

interface ListingDetailClientProps {
  listing: ServiceListing
  items?: ServiceListingItem[]
  host?: ListingHost | null
}

export function ListingDetailClient({ listing, items = [], host }: ListingDetailClientProps) {
  const imageUrl = listing.images?.[0] || '/placeholder-listing.svg'
  const ratingDisplay =
    listing.average_rating > 0 ? `${listing.average_rating.toFixed(1)}` : 'New'

  // When items exist, exactly one must be picked to book. Auto-select the
  // first item so the sidebar price/form has something to render; user can
  // switch via the carousel arrows or by clicking another card.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  )
  const selectedItem = items.find(i => i.id === selectedItemId) || null

  // No carousel state needed — items are shown in a grid, each card is
  // individually clickable to select for booking.

  const router = useRouter()
  const [openingChat, setOpeningChat] = useState(false)

  async function handleMessageHost() {
    if (!host) return
    setOpeningChat(true)
    const res = await startDirectMessage(host.id)
    setOpeningChat(false)
    if ('error' in res && res.error) { toast.error(res.error); return }
    if ('roomId' in res && res.roomId) router.push(`/community/${res.roomId}`)
  }

  const displayPricePaise = selectedItem?.price_paise ?? listing.price_paise
  const displayAvailable = selectedItem
    ? selectedItem.quantity_available
    : listing.quantity_available
  const isRental = listing.type === 'rentals'
  const displayUnit = (isRental && selectedItem?.unit) || listing.unit

  // Type-specific metadata display
  const getMetadataDisplay = () => {
    const m = listing.metadata || {}
    switch (listing.type) {
      case 'stays':
        return [
          `${m.num_rooms || '?'} rooms`,
          `${m.num_bathrooms || '?'} bathrooms`,
          m.check_in_time && `Check-in: ${m.check_in_time}`,
        ].filter(Boolean)
      case 'activities':
        return [
          `${m.duration_hours || '?'} hours`,
          m.difficulty && `Difficulty: ${m.difficulty}`,
          m.guide_included && 'Guide included',
        ].filter(Boolean)
      case 'rentals':
        return [
          m.vehicle_type && `Type: ${m.vehicle_type}`,
          m.mileage_limit_km && `${m.mileage_limit_km}km limit`,
          m.transmission && `Transmission: ${m.transmission}`,
        ].filter(Boolean)
      case 'getting_around':
        return [
          m.transport_type && `Transport: ${m.transport_type}`,
          m.capacity_persons && `${m.capacity_persons} seats`,
        ].filter(Boolean)
      default:
        return []
    }
  }

  const metadataDisplay = getMetadataDisplay()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-8">
        {/* Hero image — click to expand full image */}
        <ImageLightbox src={imageUrl} alt={listing.title} className="relative aspect-video rounded-xl overflow-hidden bg-zinc-100">
          <Image
            src={imageUrl}
            alt={listing.title}
            fill
            className="object-cover"
            priority
          />
        </ImageLightbox>

        {/* Title & location */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{listing.title}</h1>
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <MapPin className="h-4 w-4" />
            <span>{listing.location}</span>
          </div>
          {listing.short_description && (
            <p className="text-lg text-muted-foreground">{listing.short_description}</p>
          )}
        </div>

        {/* Rating & reviews */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="font-bold text-lg">{ratingDisplay}</span>
            {listing.review_count > 0 && (
              <span className="text-muted-foreground">({listing.review_count} reviews)</span>
            )}
          </div>
        </div>

        {/* Metadata */}
        {metadataDisplay.length > 0 && (
          <div className="bg-secondary/50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              {metadataDisplay.map((item, idx) => (
                <div key={idx} className="text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Amenities (master level — hidden for rentals since they live per-item) */}
        {!isRental && listing.amenities && listing.amenities.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Amenities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {listing.amenities.map((amenity) => (
                <div key={amenity} className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-primary" />
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {listing.description && (
          <div>
            <h2 className="text-xl font-bold mb-4">About</h2>
            <div className="text-muted-foreground whitespace-pre-wrap">
              {listing.description}
            </div>
          </div>
        )}

        {/* Hosted by */}
        {host && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Hosted by</p>
            <div className="flex items-center gap-3">
              {host.avatar_url ? (
                <Image
                  src={host.avatar_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <UserIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/profile/${host.username}`}
                  className="font-bold text-foreground hover:text-primary transition-colors"
                >
                  {host.full_name || host.username}
                </Link>
                {host.host_rating != null && host.host_rating > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-muted-foreground">{host.host_rating.toFixed(1)} host rating</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href={`/profile/${host.username}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  View profile
                </Link>
                <button
                  type="button"
                  onClick={handleMessageHost}
                  disabled={openingChat}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  {openingChat ? 'Opening…' : 'Message'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Location map — shows for stays, rentals, activities when a pin has been set */}
        {listing.latitude && listing.longitude && listing.type !== 'getting_around' && (() => {
          const lat = listing.latitude
          const lon = listing.longitude
          const delta = 0.008
          const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`
          const osmSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
          const gmapsHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
          return (
            <div>
              <h2 className="text-xl font-bold mb-3">Location</h2>
              <div className="rounded-xl overflow-hidden border border-border" style={{ height: 260 }}>
                <iframe
                  title="Listing location"
                  width="100%"
                  height="290"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={osmSrc}
                  className="w-full block"
                  style={{ border: 0, marginBottom: -30 }}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <a
                  href={gmapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              </div>
            </div>
          )
        })()}

        {/* Items picker — grid, 3 per row, each card clickable to select */}
        {items.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3">Choose an option</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => {
                const isSelected = item.id === selectedItemId
                const soldOut = item.quantity_available === 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !soldOut && setSelectedItemId(item.id)}
                    disabled={soldOut}
                    className={`text-left rounded-xl border overflow-hidden transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    } ${soldOut ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {/* Square image */}
                    <div className="aspect-square bg-secondary overflow-hidden relative">
                      {item.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.images[0]}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {soldOut && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded">Sold out</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5 space-y-0.5">
                      <p className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</p>
                      <p className="text-sm font-bold text-primary">
                        {formatPrice(item.price_paise)}
                        {item.unit ? ` / ${item.unit.replace('per_', '').replace('_', ' ')}` : ''}
                      </p>
                      {!soldOut && (
                        <p className="text-xs text-green-600">{item.quantity_available} available</p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pt-0.5">
                          {stripMarkdown(item.description)}
                        </p>
                      )}
                      {item.amenities && item.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {item.amenities.slice(0, 3).map(a => (
                            <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <span key={tag} className="inline-block bg-primary/10 text-primary text-sm px-3 py-1 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar - Booking form */}
      <div className="lg:col-span-1">
        <div className="sticky top-6 rounded-xl border border-border bg-card p-6 space-y-4">
          {/* Price — shows selected item's price if items exist, otherwise
              master listing price. Never shows a stale master price when
              individual items have their own pricing. */}
          <div>
            {items.length > 0 ? (
              selectedItem ? (
                <>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {selectedItem.name}
                  </div>
                  <div className="text-3xl font-bold text-primary mb-1">
                    {formatPrice(selectedItem.price_paise)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    per {displayUnit.replace('per_', '').replace('_', ' ')}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an option to see pricing
                </p>
              )
            ) : (
              <>
                <div className="text-3xl font-bold text-primary mb-1">
                  {formatPrice(listing.price_paise)}
                </div>
                <div className="text-sm text-muted-foreground">
                  per {listing.unit.replace('per_', '').replace('_', ' ')}
                </div>
              </>
            )}
          </div>

          {/* Availability */}
          {displayAvailable != null && (
            <div className="text-sm">
              <span className={displayAvailable > 0 ? 'text-green-600' : 'text-red-600'}>
                {displayAvailable > 0
                  ? `${displayAvailable} available`
                  : 'Sold out'}
              </span>
            </div>
          )}

          {/* Booking form */}
          <div className="border-t border-border pt-4">
            <Suspense fallback={<div className="h-64 bg-secondary/50 rounded-lg animate-pulse" />}>
              <ListingBookingForm listing={listing} selectedItem={selectedItem} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
