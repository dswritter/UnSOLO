import type { ServiceListingType } from '@/types'

// Flip to true to re-enable the Getting Around category site-wide.
// Keep false until there's sufficient listing inventory.
export const GETTING_AROUND_ENABLED = false

export interface FilterOption {
  label: string
  value: string
}

export interface RangeFilter {
  min: number
  max: number
  step: number
  label: string
}

export const filterConfigByType: Record<
  ServiceListingType,
  {
    price?: RangeFilter
    amenities?: string[]
    difficulty?: FilterOption[]
    activityType?: FilterOption[]
    vehicleType?: FilterOption[]
    transportType?: FilterOption[]
    duration?: RangeFilter
    location?: { label: string }
  }
> = {
  stays: {
    price: {
      min: 500,
      max: 50000,
      step: 500,
      label: 'Price per night (₹)',
    },
    amenities: [
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
    location: { label: 'Location' },
  },

  activities: {
    price: {
      min: 500,
      max: 10000,
      step: 500,
      label: 'Price per person (₹)',
    },
    duration: {
      min: 0.5,
      max: 12,
      step: 0.5,
      label: 'Duration (hours)',
    },
    difficulty: [
      { label: 'Easy', value: 'easy' },
      { label: 'Moderate', value: 'moderate' },
      { label: 'Challenging', value: 'challenging' },
    ],
    activityType: [
      { label: 'Adventure', value: 'adventure' },
      { label: 'Cultural', value: 'cultural' },
      { label: 'Nature', value: 'nature' },
      { label: 'Water Sports', value: 'water_sports' },
      { label: 'Wellness', value: 'wellness' },
    ],
  },

  rentals: {
    price: {
      min: 500,
      max: 5000,
      step: 500,
      label: 'Price (₹)',
    },
    duration: {
      min: 1,
      max: 30,
      step: 1,
      label: 'Duration (days)',
    },
    vehicleType: [
      { label: 'Car', value: 'car' },
      { label: 'Bike/Scooter', value: 'bike' },
      { label: 'Gear', value: 'gear' },
    ],
    location: { label: 'Pickup Location' },
  },

  getting_around: {
    price: {
      min: 100,
      max: 2000,
      step: 100,
      label: 'Price per km (₹)',
    },
    transportType: [
      { label: 'Taxi', value: 'taxi' },
      { label: 'Auto', value: 'auto' },
      { label: 'Bus', value: 'bus' },
      { label: 'Shuttle', value: 'shuttle' },
    ],
  },
}

export function getFiltersForType(type: ServiceListingType) {
  return filterConfigByType[type] || {}
}

export const unitByType: Record<ServiceListingType, string> = {
  stays: 'per night',
  activities: 'per person',
  rentals: 'per day',
  getting_around: 'per km',
}

export const typeLabels: Record<ServiceListingType, string> = {
  stays: 'Stays',
  activities: 'Activities',
  rentals: 'Rentals',
  getting_around: 'Getting Around',
}

export const typeEmojis: Record<ServiceListingType, string> = {
  stays: '🏠',
  activities: '🎯',
  rentals: '🚗',
  getting_around: '🚕',
}
