import { describe, expect, it } from 'vitest'
import { tallyPoll } from './poll-votes'

describe('tallyPoll', () => {
  const options = [{ id: 'a', label: '03-09 Dec' }, { id: 'b', label: '12-15 Dec' }]
  it('counts one vote per person and finds mine', () => {
    const r = tallyPoll(options, [{ postId: 'p', userId: 'u1', choice: 'b' }, { postId: 'p', userId: 'u2', choice: 'b' }, { postId: 'p', userId: 'u3', choice: 'a' }], 'u3')
    expect(r).toEqual({ options: [{ id: 'a', label: '03-09 Dec', votes: 1 }, { id: 'b', label: '12-15 Dec', votes: 2 }], myChoice: 'a' })
  })
  it('has no choice for guests or non-voters', () => {
    expect(tallyPoll(options, [{ postId: 'p', userId: 'u1', choice: 'a' }], null).myChoice).toBeNull()
    expect(tallyPoll(options, [], 'u9').options.map((o) => o.votes)).toEqual([0, 0])
  })
})
