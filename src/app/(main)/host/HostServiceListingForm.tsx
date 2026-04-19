'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createHostServiceListing } from '@/actions/host-service-listings'
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
  const [formData, setFormData] = useState({
    title: '',
    destinationId: '',
    location: '',
    shortDescription: '',
    description: '',
    pricePaise: 10000, // Default 100 INR in paise
    unit: TYPE_CONFIGS[type].defaultUnit,
    maxGuestsPerBooking: 1,
    quantityAvailable: 1,
    amenities: TYPE_CONFIGS[type].suggestedAmenities,
    difficulty: type === 'activities' ? 'easy' : undefined,
    tags: [],
  })

  const config = TYPE_CONFIGS[type]
  const selectedDest = destinations.find(d => d.id === formData.destinationId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.destinationId) {
      toast.error('Please select a destination')
      return
    }

    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return
    }

    setIsLoading(true)

    try {
      const result = await createHostServiceListing({
        destination_id: formData.destinationId,
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
      // Redirect to host dashboard
      router.push('/host')
    } catch (error) {
      console.error('Error creating service listing:', error)
      toast.error('Failed to create service listing')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-card border border-border rounded-xl p-6">
      {/* Destination */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Destination *</label>
        <select
          value={formData.destinationId}
          onChange={(e) => setFormData(prev => ({ ...prev, destinationId: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary"
        >
          <option value="">Select a destination...</option>
          {destinations.map(dest => (
            <option key={dest.id} value={dest.id}>
              {dest.name}, {dest.state}
            </option>
          ))}
        </select>
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
        <label className="text-sm font-semibold">Specific Location</label>
        <input
          type="text"
          placeholder="e.g., Near Lake, Downtown area"
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
          {config.suggestedAmenities.map(amenity => (
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
