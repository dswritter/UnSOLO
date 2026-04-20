'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ServiceListing, Destination, formatPrice } from '@/types'
import { approveServiceListing, rejectServiceListing } from '@/actions/admin-service-listings'

interface ServiceListingsClientProps {
  serviceListings: ServiceListing[]
  destinations: Destination[]
}

export function ServiceListingsClient({ serviceListings, destinations }: ServiceListingsClientProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'archived'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = serviceListings.filter((l) => {
    if (filter !== 'all' && l.status !== filter) return false
    if (typeFilter !== 'all' && l.type !== typeFilter) return false
    return true
  })

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this listing?')) return
    setLoading(id)
    try {
      await approveServiceListing(id)
      window.location.reload()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setLoading(null)
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    setLoading(id)
    try {
      await rejectServiceListing(id, reason)
      window.location.reload()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-600">Status</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="mt-1 rounded border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="mt-1 rounded border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="stays">Stays</option>
            <option value="activities">Activities</option>
            <option value="rentals">Rentals</option>
            <option value="getting_around">Getting Around</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Title</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Price</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Rating</th>
              <th className="px-4 py-3 text-left font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((listing) => (
              <tr
                key={listing.id}
                className="border-b border-zinc-200 hover:bg-blue-50 cursor-pointer"
                onClick={() => window.location.href = `/admin/service-listings/${listing.id}`}
              >
                <td className="px-4 py-3">
                  <div className="max-w-xs truncate">
                    <div className="font-medium text-blue-700 hover:underline">{listing.title}</div>
                    <div className="text-xs text-zinc-500">{listing.location}</div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">{listing.type}</td>
                <td className="px-4 py-3 font-mono">{formatPrice(listing.price_paise)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs font-semibold capitalize ${
                      listing.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : listing.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : listing.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {listing.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {listing.average_rating > 0 ? (
                    <div className="text-sm">
                      <span className="font-medium">{listing.average_rating.toFixed(1)}</span>
                      <span className="ml-1 text-xs text-zinc-500">({listing.review_count})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">No reviews</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {new Date(listing.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/service-listings/${listing.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Edit
                    </Link>
                    {listing.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(listing.id)}
                          disabled={loading === listing.id}
                          className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                        >
                          {loading === listing.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(listing.id)}
                          disabled={loading === listing.id}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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
          <div className="p-8 text-center text-zinc-500">No service listings found</div>
        )}
      </div>

      <div className="text-xs text-zinc-500">
        Showing {filtered.length} of {serviceListings.length} listings
      </div>
    </div>
  )
}
