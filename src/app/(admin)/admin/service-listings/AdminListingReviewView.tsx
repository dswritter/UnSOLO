'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  MapPin,
  Tag,
  Package,
  ImageIcon,
  AlertTriangle,
  User,
  Clock,
} from 'lucide-react'
import { formatPrice } from '@/types'
import { approveServiceListing, rejectServiceListing } from '@/actions/admin-service-listings'

type Item = {
  id: string
  name: string
  description: string | null
  price_paise: number
  unit: string | null
  quantity_available: number
  max_per_booking: number
  images: string[]
  amenities: string[] | null
  is_active: boolean
}

type Listing = {
  id: string
  title: string
  slug: string
  type: string
  status: string
  location: string | null
  short_description: string | null
  description: string | null
  price_paise: number
  unit: string
  images: string[] | null
  tags: string[] | null
  amenities: string[] | null
  metadata: Record<string, unknown> | null
  is_active: boolean
  is_featured: boolean
  first_approved_at?: string | null
  created_at: string
  updated_at: string | null
  host?: { id: string; username: string; full_name: string | null; avatar_url: string | null } | null
  items: Item[]
}

const TYPE_LABELS: Record<string, string> = {
  stays: 'Stay',
  activities: 'Activity',
  rentals: 'Rental',
  getting_around: 'Getting Around',
}

function Field({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-zinc-50'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function AdminListingReviewView({ listing }: { listing: Listing }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)

  const isReReview = !!listing.first_approved_at
  const previewUrl = `/listings/${listing.type}/${listing.slug}`

  async function handleApprove() {
    if (!confirm('Approve this listing? It will become publicly visible immediately.')) return
    setLoading('approve')
    try {
      await approveServiceListing(listing.id)
      router.push('/admin/service-listings')
      router.refresh()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      setLoading(null)
    }
  }

  async function handleReject() {
    const reason = prompt('Reason for rejection (shown to host):')
    if (!reason?.trim()) return
    setLoading('reject')
    try {
      await rejectServiceListing(listing.id, reason.trim())
      router.push('/admin/service-listings')
      router.refresh()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Status banner ─────────────────────────────────────────────── */}
      <div className={`flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl border p-4 ${
        isReReview
          ? 'border-amber-300 bg-amber-50'
          : 'border-yellow-300 bg-yellow-50'
      }`}>
        <div className="flex-1 min-w-0">
          {isReReview ? (
            <>
              <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Re-submitted after host edit
              </div>
              <p className="text-xs text-amber-600 mt-1">
                This listing was previously approved. The host made changes — review what's below
                carefully before approving again.
                First approved: {new Date(listing.first_approved_at!).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-yellow-700 font-semibold text-sm">
                <Clock className="h-4 w-4 flex-shrink-0" />
                New listing — pending first review
              </div>
              <p className="text-xs text-yellow-600 mt-1">
                Submitted {new Date(listing.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.
                Review all details and items below before approving.
              </p>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-shrink-0">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </a>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            {loading === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>

      {/* ── Core info ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {TYPE_LABELS[listing.type] || listing.type}
              </span>
              {listing.is_featured && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Featured</span>
              )}
            </div>
            <h2 className="mt-1 text-xl font-bold text-zinc-900">{listing.title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">slug: {listing.slug}</p>
          </div>
        </div>

        {/* Host */}
        {listing.host && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <User className="h-4 w-4" />
            <span>Listed by</span>
            <Link
              href={`/profile/${listing.host.username}`}
              target="_blank"
              className="font-medium text-blue-600 hover:underline"
            >
              {listing.host.full_name || listing.host.username}
            </Link>
            <span className="text-zinc-400">(@{listing.host.username})</span>
          </div>
        )}

        {/* Location */}
        {listing.location && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
            <span className="text-zinc-700">{listing.location}</span>
          </div>
        )}

        {/* Descriptions */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Short description" value={listing.short_description} highlight={isReReview} />
          <Field label="About" value={listing.description} highlight={isReReview} />
        </div>

        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-zinc-400" />
            {listing.tags.map(t => (
              <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">{t}</span>
            ))}
          </div>
        )}

        {/* Master amenities (non-rentals) */}
        {listing.amenities && listing.amenities.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.amenities.map(a => (
                <span key={a} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{a}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Cover images ──────────────────────────────────────────────── */}
      {listing.images && listing.images.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="h-4 w-4 text-zinc-400" />
            <h3 className="font-semibold text-zinc-800">Cover images ({listing.images.length})</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {listing.images.map((url, idx) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <Image
                  src={url}
                  alt={`Image ${idx + 1}`}
                  width={160}
                  height={120}
                  className="h-28 w-40 rounded-lg object-cover border border-zinc-200 hover:opacity-90 transition-opacity"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Items ─────────────────────────────────────────────────────── */}
      {listing.items.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-zinc-400" />
            <h3 className="font-semibold text-zinc-800">Items ({listing.items.length})</h3>
            {isReReview && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                Changes may be here
              </span>
            )}
          </div>

          <div className="space-y-3">
            {listing.items.map((item) => (
              <div
                key={item.id}
                className={`flex gap-3 rounded-xl border p-3 ${
                  isReReview ? 'border-amber-200 bg-amber-50/50' : 'border-zinc-100 bg-zinc-50'
                } ${!item.is_active ? 'opacity-50' : ''}`}
              >
                {/* Item image */}
                {item.images[0] ? (
                  <a href={item.images[0]} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <Image
                      src={item.images[0]}
                      alt={item.name}
                      width={88}
                      height={88}
                      className="h-22 w-22 rounded-lg object-cover border border-zinc-200"
                    />
                  </a>
                ) : (
                  <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-zinc-200 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-zinc-400" />
                  </div>
                )}

                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-zinc-900 truncate">{item.name}</p>
                    {!item.is_active && (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Inactive</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-sm font-bold text-blue-700">
                      {formatPrice(item.price_paise)}
                      {item.unit ? ` / ${item.unit.replace('per_', '').replace('_', ' ')}` : ''}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {item.quantity_available} available · max {item.max_per_booking}/booking
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{item.description}</p>
                  )}

                  {item.amenities && item.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.amenities.map(a => (
                        <span key={a} className="rounded bg-white border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600">{a}</span>
                      ))}
                    </div>
                  )}

                  {/* All item images (thumbnails) */}
                  {item.images.length > 1 && (
                    <div className="flex gap-1 mt-2">
                      {item.images.slice(1).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <Image
                            src={url}
                            alt={`${item.name} image ${i + 2}`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded object-cover border border-zinc-200 hover:opacity-80"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Bottom action row ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4">
        <Link
          href="/admin/service-listings"
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Back to listings
        </Link>
        <div className="flex gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <ExternalLink className="h-4 w-4" />
            Preview public page
          </a>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            {loading === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!!loading}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading === 'approve' ? 'Approving…' : 'Approve & publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
