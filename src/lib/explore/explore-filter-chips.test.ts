import { describe, expect, it } from 'vitest'
import { exploreFilterChips, exploreHrefWithout, sortExploreItems } from './explore-filter-chips'

describe('exploreFilterChips', () => {
  it('turns active params into labelled chips', () => {
    const chips = exploreFilterChips({ tab: 'trips', q: 'kasol', difficulty: 'easy', maxBudget: '10000', minDays: '1', maxDays: '3' })
    expect(chips.map((c) => c.label)).toEqual(['Easy', 'Under ₹10,000', '1–3 days'])
    expect(chips[1].clears).toEqual(['minBudget', 'maxBudget'])
  })

  it('ignores tab, search and page', () => {
    expect(exploreFilterChips({ tab: 'stays', q: 'goa', page: '2', search: '1' })).toEqual([])
  })
})

describe('exploreHrefWithout', () => {
  it('drops the cleared keys and page, keeps search=1 on home', () => {
    expect(exploreHrefWithout({ tab: 'trips', difficulty: 'easy', page: '3', search: '1' }, ['difficulty'], '/')).toBe('/?tab=trips&search=1')
  })
})

describe('sortExploreItems', () => {
  const items = [
    { id: 'a', price_paise: 300, d: '2026-11-01' },
    { id: 'b', price_paise: 100, d: null },
    { id: 'c', price_paise: 200, d: '2026-10-20' },
  ]
  it('sorts by price and by next date', () => {
    expect(sortExploreItems(items, 'price_asc').map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(sortExploreItems(items, 'price_desc').map((i) => i.id)).toEqual(['a', 'c', 'b'])
    expect(sortExploreItems(items, 'soonest', (i) => i.d).map((i) => i.id)).toEqual(['c', 'a', 'b'])
    expect(sortExploreItems(items, 'recommended')).toBe(items)
  })
})
