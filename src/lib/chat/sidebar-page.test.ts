import { describe, expect, it } from 'vitest'
import { prioritizeActiveConversation } from './sidebar-page'

describe('active sidebar conversation', () => {
  it('puts the active chat before pinned and recent chats without changing the source page', () => {
    const page = [{ id: 'pinned' }, { id: 'recent' }, { id: 'active' }]
    expect(prioritizeActiveConversation(page, 'active').map(room => room.id)).toEqual(['active', 'pinned', 'recent'])
    expect(page.map(room => room.id)).toEqual(['pinned', 'recent', 'active'])
  })

  it('shows an out-of-page active preview without consuming a pagination slot', () => {
    const catalog = Array.from({ length: 19 }, (_, i) => ({ id: `room-${i}` }))
    const page = catalog.slice(0, 8)
    const preview = catalog[17]
    const shown = prioritizeActiveConversation([preview, ...page], preview.id)
    expect(shown[0]).toBe(preview)
    expect(page).toHaveLength(8)
    const nextPage = catalog.slice(page.length, page.length + 8)
    expect(nextPage[0].id).toBe('room-8')
    const appended = [...page, ...nextPage, ...catalog.slice(16)]
    const final = prioritizeActiveConversation(appended, preview.id)
    expect(final).toHaveLength(catalog.length)
    expect(new Set(final.map(room => room.id)).size).toBe(catalog.length)
    expect(final[0]).toBe(preview)
  })

  it('leaves order unchanged when no permitted active conversation is present', () => {
    const page = [{ id: 'a' }, { id: 'b' }]
    expect(prioritizeActiveConversation(page, 'not-accessible')).toBe(page)
    expect(prioritizeActiveConversation(page, null)).toBe(page)
  })
})
