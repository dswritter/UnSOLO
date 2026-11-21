import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  const m = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear(), key: () => null, get length() { return m.size },
  } as Storage
})
import { clearDraft, readDraft, writeDraft } from './index'

describe('drafts', () => {
  it('keeps text until it is cleared', () => {
    writeDraft('comment.p1', 'Is the road open in Jan?')
    expect(readDraft('comment.p1')).toBe('Is the road open in Jan?')
    clearDraft('comment.p1')
    expect(readDraft('comment.p1')).toBeNull()
  })
  it('drops drafts with nothing filled in', () => {
    writeDraft('compose.plan', { title: 'Spiti', body: '' })
    expect(readDraft('compose.plan')).toEqual({ title: 'Spiti', body: '' })
    writeDraft('compose.plan', { title: ' ', body: '', poll: ['', ''] })
    expect(readDraft('compose.plan')).toBeNull()
  })
})
