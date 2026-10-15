import { describe, expect, it } from 'vitest'
import { parseSearchKeywords } from './search-metadata'

describe('searchable listing metadata', () => {
  it('normalizes, deduplicates, and caps free-form search keywords', () => {
    expect(parseSearchKeywords('  Monsoon Trek, monsoon trek  ; family-friendly\nAlpine meadow ')).toEqual([
      'Monsoon Trek', 'family-friendly', 'Alpine meadow',
    ])
  })

  it('drops empty values, trims long entries, and limits the number of tokens', () => {
    const values = parseSearchKeywords(`, ${'x'.repeat(100)};${Array.from({ length: 50 }, (_, i) => `tag${i}`).join(',')}`)
    expect(values).toHaveLength(40)
    expect(values[0]).toHaveLength(80)
    expect(values[1]).toBe('tag0')
  })
})
