'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createHostServiceListing } from '@/actions/host-service-listings'
import { HostDestinationSearch } from '@/components/hosting/HostDestinationSearch'
import type { ServiceListingType, Destination } from '@/types'

interface HostServiceListingFormProps {
  type: ServiceListingType
  destinations: Destination[]
  userId: string
}

const TYPE_CONFIGS = {
  stays: {
    placeholder: 'Cozy 2BHK apartment with mountain view',
    defaultUnit: 'per_night' as const,
    suggestedAmenities: ['WiFi', 'Kitchen', 'Bathroom', 'AC', 'Parking'],
  },
  activities: {
    placeholder: 'Mountain trekking with guide (6 hours)',
    defaultUnit: 'per_person' as const,
    suggestedAmenities: ['Guide included', 'Equipment provided', 'Snacks', 'Photos included'],
  },
  rentals: {
    placeholder: 'Maruti Alto car rental',
    defaultUnit: 'per_day' as const,
    suggestedAmenities: ['Insurance', 'Fuel', 'Free mileage', 'GPS'],
  },
  getting_around: {
    placeholder: 'Airport pickup and drop service',
    defaultUnit: 'per_day' as const,
    suggestedAmenities: ['Airport service', 'On-time pickup', 'AC vehicle'],
  },
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'challenging', label: 'Challenging' },
]

export function HostServiceListingForm({
  type,
  destinations,
  userId,
}: HostServiceListingFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [customAmenityInput, setCustomAmenityInput] = useState('')
  const [addingLocation, setAddingLocation] = useState(false)
  // Known destination list grows as hosts create new ones via search.
  const [knownDestinations, setKnownDestinations] = useState<Destination[]>(destinations)
  const [formData, setFormData] = useState({
    title: '',
    destinationIds: [] as string[],
    location: '',
    shortDescription: '',
    description: '',
    pricePaise: 10000, // Default 100 INR in paise
    unit: TYPE_CONFIGS[type].defaultUnit,
    maxGuestsPerBooking: 1,
    quantityAvailable: 1,
    amenities: [...TYPE_CONFIGS[type].suggestedAmenities] as string[],
    difficulty: type === 'activities' ? 'easy' : undefined,
    tags: [] as string[],
  })

  function addCustomAmenity() {
    const v = customAmenityInput.trim()
    if (!v) return
    setFormData((prev) =>
      prev.amenities.includes(v) ? prev : { ...prev, amenities: [...prev.amenities, v] },
    )
    setCustomAmenityInput('')
  }

  const config = TYPE_CONFIGS[type]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (formData.destinationIds.length === 0) {
      toast.error('Please select at least one location')
      return
    }

    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return
    }

    setIsLoading(true)

    try {
      const result = await createHostServiceListing({
        destination_ids: formData.destinationIds,
        title: formData.title,
        type,
        description: formData.description || null,
        short_description: formData.shortDescription || null,
        price_paise: formData.pricePaise,
        unit: formData.unit,
        location: formData.location || null,
        max_guests_per_booking: formData.maxGuestsPerBooking || 1,
        quantity_available: formData.quantityAvailable,
        amenities: formData.amenities,
        tags: formData.tags,
        host_id: userId,
        metadata: type === 'activities' ? {
          difficulty: (formData.difficulty as 'easy' | 'moderate' | 'challenging' | undefined) || undefined,
        } : null,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Service listing created successfully! It will be reviewed by our team.')

      // If host filled location + address + description, offer multi-item management.
      // Otherwise treat as a flat 1-item listing and return to dashboard.
      const hasAddressAndDesc =
        !!formData.location.trim() && !!formData.description.trim()
      if (hasAddressAndDesc && result.data?.id) {
        router.push(`/host/service-listings/${result.data.id}/items`)
      } else {
        router.push('/host')
      }
    } catch (error) {
      console.error('Error creating service listing:', error)
      toast.error('Failed to create service listing')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-card border border-border rounded-xl p-6">
      {/* Locations (multi, searchable) */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Locations *</label>
        <div className="flex flex-wrap items-center gap-2">
          {formData.destinationIds.map(id => {
            const d = knownDestinations.find(x => x.id === id)
            if (!d) return null
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                {d.name}, {d.state}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    destinationIds: prev.destinationIds.filter(x => x !== id),
                  }))}
                  className="ml-1 opacity-80 hover:opacity-100"
                  aria-label={`Remove ${d.name}`}
                >
                  ×
                </button>
              </span>
            )
          })}

          {!addingLocation && (
            <button
              type="button"
              onClick={() => setAddingLocation(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80"
            >
              + Add location
            </button>
          )}
        </div>

        {addingLocation && (
          <div className="pt-1">
            <HostDestinationSearch
              destinations={knownDestinations}
              excludeIds={formData.destinationIds}
              onPick={(picked) => {
                setKnownDestinations(prev =>
                  prev.find(d => d.id === picked.id)
                    ? prev
                    : [
                        ...prev,
                        {
                          ...picked,
                          country: 'India',
                          slug: '',
                          image_url: null,
                          description: null,
                          created_at: new Date().toISOString(),
                        } as Destination,
                      ],
                )
                setFormData(prev =>
                  prev.destinationIds.includes(picked.id)
                    ? prev
                    : { ...prev, destinationIds: [...prev.destinationIds, picked.id] },
                )
                setAddingLocation(false)
              }}
              placeholder="Search any destination in India (or add a new one)..."
            />
            <button
              type="button"
              onClick={() => setAddingLocation(false)}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {formData.destinationIds.length === 0 && !addingLocation && (
          <p className="text-xs text-muted-foreground">Pick one or more locations where this listing is offered.</p>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Title *</label>
        <input
          type="text"
          placeholder={config.placeholder}
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Specific Location (Full Address)</label>
        <input
          type="text"
          placeholder="e.g., 12 Lakeside Road, Manali, HP 175131"
          value={formData.location}
          onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Short Description */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Short Description</label>
        <input
          type="text"
          placeholder="One-line description for search results"
          value={formData.shortDescription}
          onChange={(e) => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Full Description */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Full Description</label>
        <textarea
          placeholder="Detailed description of your listing..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={5}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm resize-none"
        />
      </div>

      {/* Price */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Price (₹) *</label>
          <input
            type="number"
            min="1"
            value={formData.pricePaise / 100}
            onChange={(e) => setFormData(prev => ({ ...prev, pricePaise: Math.round(Number(e.target.value) * 100) }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Unit *</label>
          <select
            value={formData.unit}
            onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value as any }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
          >
            {type === 'stays' && (
              <>
                <option value="per_night">Per night</option>
                <option value="per_day">Per day</option>
                <option value="per_week">Per week</option>
              </>
            )}
            {type === 'activities' && (
              <>
                <option value="per_person">Per person</option>
                <option value="per_hour">Per hour</option>
                <option value="per_day">Per day</option>
              </>
            )}
            {type === 'rentals' && (
              <>
                <option value="per_day">Per day</option>
                <option value="per_hour">Per hour</option>
                <option value="per_week">Per week</option>
                <option value="per_month">Per month</option>
              </>
            )}
            {type === 'getting_around' && (
              <>
                <option value="per_day">Per trip/per day</option>
                <option value="per_hour">Per hour</option>
                <option value="per_person">Per person</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Capacity / Quantity */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold">
            {type === 'stays' ? 'Rooms/Capacity' : 'Max per booking'} *
          </label>
          <input
            type="number"
            min="1"
            value={formData.maxGuestsPerBooking}
            onChange={(e) => setFormData(prev => ({ ...prev, maxGuestsPerBooking: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Available Quantity *</label>
          <input
            type="number"
            min="1"
            value={formData.quantityAvailable}
            onChange={(e) => setFormData(prev => ({ ...prev, quantityAvailable: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
          />
        </div>
      </div>

      {/* Difficulty for activities */}
      {type === 'activities' && (
        <div className="space-y-2">
          <label className="text-sm font-semibold">Difficulty Level</label>
          <select
            value={formData.difficulty || 'easy'}
            onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
          >
            {DIFFICULTY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Amenities */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Amenities/Features</label>
        <div className="flex flex-wrap gap-2">
          {Array.from(new Set([...config.suggestedAmenities, ...formData.amenities])).map(amenity => (
            <button
              key={amenity}
              type="button"
              onClick={() => setFormData(prev => ({
                ...prev,
                amenities: prev.amenities.includes(amenity)
                  ? prev.amenities.filter(a => a !== amenity)
                  : [...prev.amenities, amenity]
              }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                formData.amenities.includes(amenity)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {amenity}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            placeholder="Add your own (e.g., Heater, Balcony)"
            value={customAmenityInput}
            onChange={(e) => setCustomAmenityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomAmenity()
              }
            }}
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-xs"
          />
          <button
            type="button"
            onClick={addCustomAmenity}
            disabled={!customAmenityInput.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-4 border-t border-border">
        <Button
          type="submit"
          disabled={isLoading}
          className="flex-1 bg-primary text-primary-foreground"
        >
          {isLoading ? 'Creating...' : 'Create Listing'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
