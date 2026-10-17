import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname }))
import { MainScrollContainer } from './MainScrollContainer'

describe('main scroll ownership', () => {
  it('allows document scrolling on Home/Explore so sticky controls track the viewport', () => {
    usePathname.mockReturnValue('/')
    const html = renderToStaticMarkup(createElement(MainScrollContainer, null, 'Explore'))
    expect(html).toContain('overflow-visible')
    expect(html).not.toContain('overflow-y-auto')
    expect(html).not.toContain(' h-0 ')
  })

  it.each(['/leaderboard', '/tribe/room'])('preserves bounded inner scrolling on %s', pathname => {
    usePathname.mockReturnValue(pathname)
    const html = renderToStaticMarkup(createElement(MainScrollContainer, null, 'Content'))
    expect(html).toContain('h-0 overflow-y-auto')
    expect(html.includes('pb-[5.75rem]')).toBe(pathname === '/leaderboard')
  })
})
