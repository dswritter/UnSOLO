import { describe, expect, it } from 'vitest'
import { serviceUnitOptions } from './service-units'

describe('service pricing units', () => {
  it('offers hourly, daily, weekly and monthly rentals in both host and admin forms', () => {
    expect(serviceUnitOptions('rentals').map(o => o.value)).toEqual(['per_hour', 'per_day', 'per_week', 'per_month'])
  })
  it('keeps a legacy saved unit selectable when editing', () => {
    expect(serviceUnitOptions('rentals', 'per_night').map(o => o.value)).toContain('per_night')
    expect(serviceUnitOptions('rentals', 'per_day')).toHaveLength(4)
  })
})
