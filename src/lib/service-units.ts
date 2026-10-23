import type { ServiceListing, ServiceListingType } from '@/types'

export type ServiceUnit = ServiceListing['unit']
export type ServiceUnitOption = { value: ServiceUnit; label: string }

/** Pricing units offered per category — shared by host and admin listing forms. */
export const SERVICE_UNIT_OPTIONS: Record<ServiceListingType, ServiceUnitOption[]> = {
  stays: [
    { value: 'per_night', label: 'Per night' },
    { value: 'per_day', label: 'Per day' },
    { value: 'per_week', label: 'Per week' },
    { value: 'per_month', label: 'Per month' },
  ],
  activities: [
    { value: 'per_person', label: 'Per person' },
    { value: 'per_hour', label: 'Per hour' },
    { value: 'per_day', label: 'Per day' },
  ],
  rentals: [
    { value: 'per_hour', label: 'Per hour' },
    { value: 'per_day', label: 'Per day' },
    { value: 'per_week', label: 'Per week' },
    { value: 'per_month', label: 'Per month' },
  ],
  getting_around: [
    { value: 'per_day', label: 'Per trip / per day' },
    { value: 'per_hour', label: 'Per hour' },
    { value: 'per_person', label: 'Per person' },
  ],
}

const ALL_LABELS: Record<ServiceUnit, string> = {
  per_night: 'Per night', per_person: 'Per person', per_day: 'Per day',
  per_hour: 'Per hour', per_week: 'Per week', per_month: 'Per month',
}

/** Category options, keeping a legacy saved unit selectable so edits never silently change it. */
export function serviceUnitOptions(type: ServiceListingType, current?: ServiceUnit | null): ServiceUnitOption[] {
  const options = SERVICE_UNIT_OPTIONS[type]
  return current && !options.some(o => o.value === current)
    ? [...options, { value: current, label: ALL_LABELS[current] }]
    : options
}
