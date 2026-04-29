'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ServiceListing, Destination, formatPrice } from '@/types'
import { approveServiceListing, rejectServiceListing } from '@/actions/admin-service-listings'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'archived'

const STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'approved', 'rejected', 'archived']
const LISTING_TYPES = ['stays', 'activities', 'rentals', 'getting_around'] as const

function parseStatusFilter(raw: string | undefined): StatusFilter {
  if (raw && (STATUS_FILTERS as readonly string[]).includes(raw)) return raw as StatusFilter
  return 'all'
}

function parseTypeFilter(raw: string | undefined): 'all' | string {
  if (raw && (LISTING_TYPES as readonly string[]).includes(raw)) return raw
  return 'all'
}

interface ServiceListingsClientProps {
  serviceListings: ServiceListing[]
  destinations: Destination[]
  /** From URL (?status= / ?type=) after moderation redirect */
  initialStatusFilter?: string
  initialTypeFilter?: string
}

function statusClass(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
    case 'rejected':
      return 'bg-rose-500/15 text-rose-200 border-rose-500/35'
    case 'pending':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/35'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function ServiceListingsClient({
  serviceListings,
  destinations,
  initialStatusFilter,
  initialTypeFilter,
}: ServiceListingsClientProps) {
  const [filter, setFilter] = useState<StatusFilter>(() => parseStatusFilter(initialStatusFilter))
  const [typeFilter, setTypeFilter] = useState<'all' | string>(() => parseTypeFilter(initialTypeFilter))
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = serviceListings.filter((l) => {
    if (filter !== 'all' && l.status !== filter) return false
    if (typeFilter !== 'all' && l.type !== typeFilter) return false
    return true
  })

  function listUrlForRow(listing: ServiceListing, outcome: 'approved' | 'rejected') {
    const q = new URLSearchParams()
    q.set('type', listing.type)
    q.set('status', outcome)
    return `/admin/service-listings?${q.toString()}`
  }

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this listing?')) return
    const row = serviceListings.find((l) => l.id === id)
    setLoading(id)
    try {
      await approveServiceListing(id)
      window.location.assign(row ? listUrlForRow(row, 'approved') : '/admin/service-listings')
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setLoading(null)
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    const row = serviceListings.find((l) => l.id === id)
    setLoading(id)
    try {
      await rejectServiceListing(id, reason)
      window.location.assign(row ? listUrlForRow(row, 'rejected') : '/admin/service-listings')
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card/90 p-4 shadow-sm shadow-black/10">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Status</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            className="mt-1 w-full min-w-[140px] rounded-lg border border-border bg-secondary/80 px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="mt-1 w-full min-w-[160px] rounded-lg border border-border bg-secondary/80 px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All</option>
            <option value="stays">Stays</option>
            <option value="activities">Activities</option>
            <option value="rentals">Rentals</option>
            <option value="getting_around">Getting Around</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card/50 shadow-sm shadow-black/10">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Price</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Rating</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Created</th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((listing) => (
              <tr
                key={listing.id}
                className="border-b border-border/80 transition-colors hover:bg-primary/5 cursor-pointer"
                onClick={() => (window.location.href = `/admin/service-listings/${listing.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="max-w-xs truncate">
                    <div className="font-medium text-primary hover:underline">{listing.title}</div>
                    <div className="text-xs text-muted-foreground">{listing.location}</div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-foreground">{listing.type}</td>
                <td className="px-4 py-3 font-mono text-foreground/90">{formatPrice(listing.price_paise)}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-md border px-2 py-1 text-xs font-semibold capitalize',
                      statusClass(listing.status),
                    )}
                  >
                    {listing.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {listing.average_rating > 0 ? (
                    <div className="text-sm text-foreground">
                      <span className="font-medium">{listing.average_rating.toFixed(1)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({listing.review_count})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No reviews</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(listing.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/admin/service-listings/${listing.id}`}
                      className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      Edit
                    </Link>
                    {listing.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(listing.id)}
                          disabled={loading === listing.id}
                          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          {loading === listing.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(listing.id)}
                          disabled={loading === listing.id}
                          className="rounded-md px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">No service listings found</div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {serviceListings.length} listings
      </div>
    </div>
  )
}
