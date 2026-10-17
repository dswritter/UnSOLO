import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListingCardBadge, ListingCardMedia, ListingCardPrice } from './ListingCardParts'

describe('responsive listing media', () => {
  it('matches the host editor 16:9 banner ratio on every screen size', () => {
    const props = {
      children: createElement('img', { src: '/poster.webp', alt: 'Trip poster' }),
    }
    const html = renderToStaticMarkup(createElement(ListingCardMedia, props))
    expect(html).toContain('aspect-video')
    expect(html).not.toContain('aspect-[9/16]')
    expect(html).not.toContain('md:aspect-')
    expect(html).toContain('overflow-hidden')
  })

  describe('compact listing details', () => {
    it('keeps the full price and its unit available when the footer wraps', () => {
      const html = renderToStaticMarkup(createElement(ListingCardPrice, {
        amount: '₹28,500', suffix: 'person', from: true,
      }))
      expect(html).toContain('From ')
      expect(html).toContain('₹28,500')
      expect(html).toContain('/ person')
      expect(html).toContain('flex-wrap')
      expect(html).not.toContain('truncate')
    })

    it('retains status labels in a compact image overlay', () => {
      const html = renderToStaticMarkup(createElement(ListingCardBadge, {
        badge: { tone: 'community', label: 'Community' },
      }))
      expect(html).toContain('Community')
      expect(html).toContain('text-[9px]')
      expect(html).toContain('md:text-[11px]')
      expect(renderToStaticMarkup(createElement(ListingCardBadge, { badge: null }))).toBe('')
    })
  })

  it('retains the subdued image treatment for past editions', () => {
    const props = { muted: true, children: 'Past poster' }
    const html = renderToStaticMarkup(createElement(ListingCardMedia, props))
    expect(html).toContain('[&amp;_img]:brightness-90')
    expect(html).toContain('aspect-video')
  })
})
