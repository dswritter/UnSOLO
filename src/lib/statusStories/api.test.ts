import { describe, expect, it } from 'vitest'
import { groupStatuses } from './api'

const row = (id: string, author: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, author_id: author, media_url: `https://x/${id}.webp`, media_type: 'image', created_at: at, expires_at: '2026-11-23T00:00:00Z',
  author: { id: author, username: author, full_name: author.toUpperCase() }, ...extra,
})

describe('groupStatuses', () => {
  it('groups per person, oldest first, mine first, then unseen, then newest', () => {
    const rows = [
      row('a2', 'ann', '2026-11-22T10:00:00Z'), row('a1', 'ann', '2026-11-22T08:00:00Z'),
      row('b1', 'bob', '2026-11-22T11:00:00Z'), row('m1', 'me', '2026-11-22T07:00:00Z'),
    ]
    const g = groupStatuses(rows, new Set(['b1']), 'me')
    expect(g.map((a) => a.user.id)).toEqual(['me', 'ann', 'bob'])
    expect(g[1].items.map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(g[1].unseen).toBe(true)
    expect(g[2].unseen).toBe(false)
    expect(g[2].items[0].seen).toBe(true)
    expect(g[0].unseen).toBe(false)
  })
  it('maps text statuses without media', () => {
    const [a] = groupStatuses([row('t1', 'ann', '2026-11-22T10:00:00Z', { media_url: null, media_type: 'text', caption: 'Hi' })], new Set(), null)
    expect(a.items[0]).toMatchObject({ type: 'text', media: null, caption: 'Hi' })
  })
})
