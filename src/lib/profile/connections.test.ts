import { describe, expect, it } from 'vitest'
import { distinctIds, intersectIds, orderProfiles, summarizeReviews, type ReceivedReview } from './connections'

describe('profile connections helpers', () => {
  it('intersects ids, keeping order and dropping excluded/duplicates', () => {
    expect(intersectIds(['a', 'b', 'c', 'b', 'me'], ['c', 'b', 'me', 'z'], ['me'])).toEqual(['b', 'c'])
  })

  it('dedupes ids and skips empty values', () => {
    expect(distinctIds(['x', null, 'y', 'x', undefined, 'host'], ['host'])).toEqual(['x', 'y'])
  })

  it('orders profile rows by id list', () => {
    expect(orderProfiles(['b', 'missing', 'a'], [{ id: 'a' }, { id: 'b' }]).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('summarizes reviews newest-first with an average', () => {
    const r = (id: string, rating: number, createdAt: string): ReceivedReview => ({
      id, rating, createdAt, body: null, reviewerId: 'u', subject: null, href: null,
    })
    const s = summarizeReviews([r('1', 5, '2025-01-01'), r('2', 4, '2025-03-01'), r('3', 4, '2025-02-01')], 2)
    expect(s.items.map(i => i.id)).toEqual(['2', '3'])
    expect(s.total).toBe(3)
    expect(s.average).toBe(4.3)
    expect(summarizeReviews([]).average).toBeNull()
  })
})
