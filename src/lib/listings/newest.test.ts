import { describe, expect, it } from 'vitest'
import { markNewListings, newestIdsByType } from './newest'

const row = (id: string, type: string, at: string, approved?: string) => ({ id, type, created_at: at, first_approved_at: approved ?? null })

describe('newestIdsByType', () => {
  it('keeps the N most recently published per type', () => {
    const rows = [
      row('a', 'stays', '2026-01-01'), row('b', 'stays', '2026-03-01'), row('c', 'stays', '2026-02-01'),
      row('d', 'rentals', '2025-01-01'),
    ]
    expect([...newestIdsByType(rows, 2)].sort()).toEqual(['b', 'c', 'd'])
  })
  it('uses first approval time over creation time', () => {
    const rows = [row('old', 'stays', '2025-01-01', '2026-05-01'), row('fresh', 'stays', '2026-04-01')]
    expect([...newestIdsByType(rows, 1)]).toEqual(['old'])
  })
  it('a newly published listing pushes the oldest "new" one out', () => {
    const rows = [row('a', 'stays', '2026-01-01'), row('b', 'stays', '2026-02-01')]
    expect(newestIdsByType(rows, 2).has('a')).toBe(true)
    expect(newestIdsByType([...rows, row('c', 'stays', '2026-03-01')], 2).has('a')).toBe(false)
  })
  it('marks listings', () => {
    expect(markNewListings([{ id: 'x' }, { id: 'y' }], new Set(['y']))).toEqual([{ id: 'x', is_new: false }, { id: 'y', is_new: true }])
  })
})
