import { describe, expect, it } from 'vitest'
import { cleanQuery, extractMentions } from './mentions'

describe('extractMentions', () => {
  it('finds @usernames, lower-cased and unique', () => {
    expect(extractMentions('Camping with @Kuuntal and @ananya.s, @kuuntal again!')).toEqual(['kuuntal', 'ananya.s'])
  })
  it('ignores emails and trailing dots', () => {
    expect(extractMentions('mail me a@b.com or ping @rinku.')).toEqual(['rinku'])
  })
  it('handles empty text', () => {
    expect(extractMentions(null)).toEqual([])
  })
})

describe('cleanQuery', () => {
  it('drops filter characters and a leading @', () => {
    expect(cleanQuery('@ri,nk(u)*')).toBe('rinku')
    expect(cleanQuery('Dharm Singh')).toBe('Dharm Singh')
  })
})
