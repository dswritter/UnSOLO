'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Destination, ServiceListing, ServiceListingType, ServiceListingMetadata } from '@/types'
import type { PriceVariant } from '@/lib/package-pricing'
import { createServiceListing, updateServiceListing } from '@/actions/admin-service-listings'

const AMENITIES_BY_TYPE = {
  stays: [
    'WiFi',
    'AC',
    'Kitchen',
    'Parking',
    'Hot Water',
    'TV',
    'Washing Machine',
    'Garden',
    'Terrace',
    'Gym',
  ],
  activities: [
    'Guide Included',
    'Equipment Provided',
    'Transport Included',
    'Meals Included',
    'Insurance Included',
    'Photography',
  ],
  rentals: [
    'GPS',
    'Helmet',
    'Lock',
    'Phone Mount',
    'Insurance Included',
    'Fuel Card',
    'Child Seat',
  ],
  getting_around: [
    'AC',
    'WiFi',
    'Water',
    'Music System',
    'Professional Driver',
    'Insurance',
  ],
}

interface ServiceListingFormProps {
  destinations: Destination[]
  listing?: ServiceListing
}

export function ServiceListingForm({ destinations, listing }: ServiceListingFormProps) {
  const router = useRouter()
  const [type, setType] = useState<ServiceListingType>(listing?.type || 'stays')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingLocation, setAddingLocation] = useState(false)

  const [formData, setFormData] = useState({
    title: listing?.title || '',
    slug: listing?.slug || '',
    description: listing?.description || '',
    short_description: listing?.short_description || '',
    price_paise: listing?.price_paise || 0,
    price_variants: (listing?.price_variants || []) as PriceVariant[],
    unit: (listing?.unit || 'per_night') as ServiceListing['unit'],
    destination_ids: (listing?.destination_ids && listing.destination_ids.length > 0
      ? listing.destination_ids
      : listing?.destination_id
        ? [listing.destination_id]
        : []) as string[],
    location: listing?.location || '',
    latitude: listing?.latitude || null,
    longitude: listing?.longitude || null,
    max_guests_per_booking: listing?.max_guests_per_booking || null,
    quantity_available: listing?.quantity_available || null,
    images: listing?.images || [],
    amenities: listing?.amenities || [],
    tags: listing?.tags || [],
    metadata: (listing?.metadata || {}) as ServiceListingMetadata,
    is_active: listing?.is_active || false,
    is_featured: listing?.is_featured || false,
    status: listing?.status || 'pending',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (listing) {
        await updateServiceListing(listing.id, formData)
      } else {
        await createServiceListing({ ...formData, type })
      }
      router.push('/admin/service-listings')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handleMetadataChange = (key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [key]: value },
    }))
  }

  const typeAmenities = AMENITIES_BY_TYPE[type] || []

  return (
    <form onSubmit={handleSubmit} className="space-y-8 rounded-lg border border-zinc-200 bg-white p-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Basic Information</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Slug</label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Type</label>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value as ServiceListingType)}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="stays">Stays</option>
              <option value="activities">Activities</option>
              <option value="rentals">Rentals</option>
              <option value="getting_around">Getting Around</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Short Description</label>
            <input
              type="text"
              value={formData.short_description}
              onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>
        </div>
      </section>

      {/* Location & Destination */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Location</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Locations</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {formData.destination_ids.map(id => {
                const d = destinations.find(x => x.id === id)
                if (!d) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm"
                  >
                    {d.name}
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        destination_ids: prev.destination_ids.filter(x => x !== id),
                      }))}
                      className="text-blue-600 hover:text-blue-800"
                      aria-label={`Remove ${d.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}

              {addingLocation ? (
                <select
                  autoFocus
                  value=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) {
                      setFormData(prev => ({ ...prev, destination_ids: [...prev.destination_ids, v] }))
                    }
                    setAddingLocation(false)
                  }}
                  onBlur={() => setAddingLocation(false)}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                >
                  <option value="">Pick a destination...</option>
                  {destinations
                    .filter(d => !formData.destination_ids.includes(d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingLocation(true)}
                  className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50"
                >
                  + Add location
                </button>
              )}
            </div>
            {formData.destination_ids.length === 0 && (
              <p className="mt-1 text-xs text-zinc-500">At least one location is required.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Location (Human-readable)</label>
            <input
              type="text"
              required
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Manali, Himachal Pradesh"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={formData.latitude || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    latitude: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={formData.longitude || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    longitude: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Pricing</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Base Price (₹)</label>
              <input
                type="number"
                required
                min="0"
                step="100"
                value={formData.price_paise / 100}
                onChange={(e) =>
                  setFormData({ ...formData, price_paise: Math.round(parseFloat(e.target.value) * 100) })
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Unit</label>
              <select
                required
                value={formData.unit}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    unit: e.target.value as ServiceListing['unit'],
                  })
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              >
                <option value="per_night">Per Night</option>
                <option value="per_person">Per Person</option>
                <option value="per_day">Per Day</option>
                <option value="per_hour">Per Hour</option>
                <option value="per_week">Per Week</option>
                <option value="per_month">Per Month</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">
              Price Variants (Optional - for multi-tier pricing)
            </label>
            <p className="text-xs text-zinc-500">Add multiple tiers like "Basic ₹5000, Deluxe ₹7500"</p>
            {formData.price_variants.map((variant, idx) => (
              <div key={idx} className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Description (e.g., Basic)"
                  value={variant.description}
                  onChange={(e) => {
                    const newVariants = [...formData.price_variants]
                    newVariants[idx].description = e.target.value
                    setFormData({ ...formData, price_variants: newVariants })
                  }}
                  className="flex-1 rounded border border-zinc-300 px-3 py-2"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  min="0"
                  step="100"
                  value={variant.price_paise / 100}
                  onChange={(e) => {
                    const newVariants = [...formData.price_variants]
                    newVariants[idx].price_paise = Math.round(parseFloat(e.target.value) * 100)
                    setFormData({ ...formData, price_variants: newVariants })
                  }}
                  className="w-32 rounded border border-zinc-300 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newVariants = formData.price_variants.filter((_, i) => i !== idx)
                    setFormData({ ...formData, price_variants: newVariants })
                  }}
                  className="rounded px-3 py-2 text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setFormData({
                  ...formData,
                  price_variants: [
                    ...formData.price_variants,
                    { description: '', price_paise: 0 },
                  ],
                })
              }}
              className="mt-2 rounded px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
            >
              + Add Variant
            </button>
          </div>
        </div>
      </section>

      {/* Capacity & Inventory */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Capacity & Inventory</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Max Guests per Booking</label>
            <input
              type="number"
              min="0"
              value={formData.max_guests_per_booking || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  max_guests_per_booking: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Quantity Available</label>
            <input
              type="number"
              min="0"
              value={formData.quantity_available || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity_available: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>
        </div>
      </section>

      {/* Amenities */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Amenities</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {typeAmenities.map((amenity) => (
            <label key={amenity} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.amenities.includes(amenity)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({
                      ...formData,
                      amenities: [...formData.amenities, amenity],
                    })
                  } else {
                    setFormData({
                      ...formData,
                      amenities: formData.amenities.filter((a) => a !== amenity),
                    })
                  }
                }}
                className="rounded border-zinc-300"
              />
              <span className="text-sm">{amenity}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Tags */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Tags</h2>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {formData.tags.map((tag, idx) => (
              <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm">
                {tag}
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      tags: formData.tags.filter((_, i) => i !== idx),
                    })
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="Add tags (press Enter)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                e.preventDefault()
                setFormData({
                  ...formData,
                  tags: [...formData.tags, e.currentTarget.value],
                })
                e.currentTarget.value = ''
              }
            }}
            className="block w-full rounded border border-zinc-300 px-3 py-2"
          />
        </div>
      </section>

      {/* Type-Specific Metadata */}
      <TypeSpecificFields type={type} metadata={formData.metadata} onChange={handleMetadataChange} />

      {/* Moderation */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Moderation</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-zinc-300"
            />
            <span className="text-sm font-medium">Active</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_featured}
              onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
              className="rounded border-zinc-300"
            />
            <span className="text-sm font-medium">Featured</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as ServiceListing['status'],
                })
              }
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </section>

      {/* Submit */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : listing ? 'Update Listing' : 'Create Listing'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-300 px-6 py-2 font-medium hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

interface TypeSpecificFieldsProps {
  type: ServiceListingType
  metadata: ServiceListingMetadata
  onChange: (key: string, value: unknown) => void
}

function TypeSpecificFields({ type, metadata, onChange }: TypeSpecificFieldsProps) {
  if (type === 'stays') {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">Stays Details</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Number of Rooms</label>
              <input
                type="number"
                min="0"
                value={metadata.num_rooms || ''}
                onChange={(e) =>
                  onChange('num_rooms', e.target.value ? parseInt(e.target.value) : undefined)
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Number of Bathrooms</label>
              <input
                type="number"
                min="0"
                value={metadata.num_bathrooms || ''}
                onChange={(e) =>
                  onChange('num_bathrooms', e.target.value ? parseInt(e.target.value) : undefined)
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Check-in Time</label>
              <input
                type="time"
                value={metadata.check_in_time || ''}
                onChange={(e) => onChange('check_in_time', e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Check-out Time</label>
              <input
                type="time"
                value={metadata.check_out_time || ''}
                onChange={(e) => onChange('check_out_time', e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Cancellation Policy</label>
            <select
              value={metadata.cancellation_policy || ''}
              onChange={(e) => onChange('cancellation_policy', e.target.value)}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="">Select policy</option>
              <option value="free_until_7_days">Free until 7 days before</option>
              <option value="free_until_14_days">Free until 14 days before</option>
              <option value="50_percent">50% refund up to 7 days before</option>
              <option value="non_refundable">Non-refundable</option>
            </select>
          </div>
        </div>
      </section>
    )
  }

  if (type === 'activities') {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">Activities Details</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Duration (Hours)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={metadata.duration_hours || ''}
                onChange={(e) =>
                  onChange('duration_hours', e.target.value ? parseFloat(e.target.value) : undefined)
                }
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Difficulty</label>
              <select
                value={metadata.difficulty || ''}
                onChange={(e) => onChange('difficulty', e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              >
                <option value="">Select difficulty</option>
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="challenging">Challenging</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Activity Category</label>
            <select
              value={metadata.activity_category || ''}
              onChange={(e) => onChange('activity_category', e.target.value)}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="">Select category</option>
              <option value="adventure">Adventure</option>
              <option value="cultural">Cultural</option>
              <option value="nature">Nature</option>
              <option value="water_sports">Water Sports</option>
              <option value="wellness">Wellness</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={metadata.guide_included || false}
              onChange={(e) => onChange('guide_included', e.target.checked)}
              className="rounded border-zinc-300"
            />
            <span className="text-sm font-medium">Guide Included</span>
          </label>
        </div>
      </section>
    )
  }

  if (type === 'rentals') {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">Rentals Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Vehicle Type</label>
            <select
              value={metadata.vehicle_type || ''}
              onChange={(e) => onChange('vehicle_type', e.target.value)}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="">Select type</option>
              <option value="car">Car</option>
              <option value="bike">Bike/Scooter</option>
              <option value="gear">Gear (Camping/Hiking)</option>
            </select>
          </div>

          {metadata.vehicle_type === 'car' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Fuel Type</label>
                <select
                  value={metadata.fuel_type || ''}
                  onChange={(e) => onChange('fuel_type', e.target.value)}
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                >
                  <option value="">Select fuel</option>
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Transmission</label>
                <select
                  value={metadata.transmission || ''}
                  onChange={(e) => onChange('transmission', e.target.value)}
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                >
                  <option value="">Select transmission</option>
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700">Mileage Limit (km)</label>
            <input
              type="number"
              min="0"
              value={metadata.mileage_limit_km || ''}
              onChange={(e) =>
                onChange('mileage_limit_km', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>
        </div>
      </section>
    )
  }

  if (type === 'getting_around') {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">Getting Around Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Transport Type</label>
            <select
              value={metadata.transport_type || ''}
              onChange={(e) => onChange('transport_type', e.target.value)}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="">Select type</option>
              <option value="taxi">Taxi</option>
              <option value="auto">Auto</option>
              <option value="bus">Bus</option>
              <option value="shuttle">Shuttle</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Capacity (Persons)</label>
            <input
              type="number"
              min="0"
              value={metadata.capacity_persons || ''}
              onChange={(e) =>
                onChange('capacity_persons', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Route Origin</label>
              <input
                type="text"
                value={metadata.route_origin || ''}
                onChange={(e) => onChange('route_origin', e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Route Destination</label>
              <input
                type="text"
                value={metadata.route_destination || ''}
                onChange={(e) => onChange('route_destination', e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>
        </div>
      </section>
    )
  }

  return null
}
