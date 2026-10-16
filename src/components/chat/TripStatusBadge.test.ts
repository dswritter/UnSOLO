import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TripStatusBadge } from './TripStatusBadge'

describe('trip membership labels', () => {
  it.each([
    ['upcoming', 'Trip booked'],
    ['ongoing', 'On this trip'],
    ['completed', 'Trip completed'],
  ] as const)('explains %s without looking like a message receipt', (phase, label) => {
    const html = renderToStaticMarkup(createElement(TripStatusBadge, { phase }))
    expect(html).toContain(label)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('rounded-md border')
  })
})
