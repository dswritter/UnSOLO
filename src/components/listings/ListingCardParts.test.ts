import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListingCardMedia } from './ListingCardParts'

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

  it('retains the subdued image treatment for past editions', () => {
    const props = { muted: true, children: 'Past poster' }
    const html = renderToStaticMarkup(createElement(ListingCardMedia, props))
    expect(html).toContain('[&amp;_img]:brightness-90')
    expect(html).toContain('aspect-video')
  })
})
