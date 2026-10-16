import { describe, expect, it } from 'vitest'
import { parseStoredColorMode, resolveColorMode } from './color-mode'

describe('resolveColorMode', () => {
  it('follows the OS when the user has not picked', () => {
    expect(resolveColorMode(null, 'dark')).toBe('dark')
    expect(resolveColorMode(null, 'light')).toBe('light')
  })

  it('keeps the user pick while the OS scheme is unchanged', () => {
    expect(resolveColorMode({ mode: 'light', sys: 'dark' }, 'dark')).toBe('light')
    expect(resolveColorMode({ mode: 'dark', sys: 'light' }, 'light')).toBe('dark')
  })

  it('lets an OS flip override the earlier pick', () => {
    expect(resolveColorMode({ mode: 'light', sys: 'light' }, 'dark')).toBe('dark')
    expect(resolveColorMode({ mode: 'dark', sys: 'dark' }, 'light')).toBe('light')
    expect(resolveColorMode({ mode: 'light', sys: 'dark' }, 'light')).toBe('light')
  })
})

describe('parseStoredColorMode', () => {
  it('accepts only well-formed values', () => {
    expect(parseStoredColorMode('{"mode":"dark","sys":"light"}')).toEqual({ mode: 'dark', sys: 'light' })
    expect(parseStoredColorMode('{"mode":"blue","sys":"light"}')).toBeNull()
    expect(parseStoredColorMode('nope')).toBeNull()
    expect(parseStoredColorMode(null)).toBeNull()
  })
})
