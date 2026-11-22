import { describe, expect, it } from 'vitest'
import { maskPhone, visibleStatus } from './appProfile'

describe('app profile helpers', () => {
  it('masks phone numbers', () => {
    expect(maskPhone('+919760778373')).toBe('97******73')
    expect(maskPhone('123')).toBeNull()
    expect(maskPhone(null)).toBeNull()
  })
  it('hides followers-only status from others', () => {
    expect(visibleStatus('Off to Spiti', 'followers', false, false)).toBeNull()
    expect(visibleStatus('Off to Spiti', 'followers', false, true)).toBe('Off to Spiti')
    expect(visibleStatus('Off to Spiti', 'followers', true, false)).toBe('Off to Spiti')
    expect(visibleStatus('  ', 'public', false, false)).toBeNull()
  })
})
