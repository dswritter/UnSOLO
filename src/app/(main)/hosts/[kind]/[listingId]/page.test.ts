import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/profile/public-host-profile', () => ({ loadPublicListingHost: mocks.load }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/components/profile/ProfileV2Shell', () => ({
  ProfileV2Shell: ({ children }: { children: React.ReactNode }) => children,
}))
import HostProfilePage from './page'

const params = Promise.resolve({ kind: 'trip', listingId: 'listing-id' })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
  mocks.notFound.mockImplementation(() => { throw new Error('not found') })
})

describe('public host page', () => {
  it('renders the host and a clickable listing without account-only actions', async () => {
    mocks.load.mockResolvedValue({
      linked: false, name: 'Strangers Tribe',
      listing: { title: 'Weekend trek', href: '/packages/weekend-trek' },
    })
    const page = await HostProfilePage({ params })
    const html = renderToStaticMarkup(createElement('div', null, page))
    expect(html).toContain('Strangers Tribe')
    expect(html).toContain('href="/packages/weekend-trek"')
    expect(html).toContain('Messaging will be available once the host links their account.')
    expect(html).not.toContain('<button')
  })
  it('redirects existing host links after account claiming', async () => {
    mocks.load.mockResolvedValue({ linked: true, username: 'strangers tribe' })
    await expect(HostProfilePage({ params })).rejects.toThrow('redirect:/profile/strangers%20tribe')
  })
  it('returns not found for non-public listings', async () => {
    mocks.load.mockResolvedValue(null)
    await expect(HostProfilePage({ params })).rejects.toThrow('not found')
  })
  it('rejects unsupported listing kinds', async () => {
    await expect(HostProfilePage({
      params: Promise.resolve({ kind: 'unknown', listingId: 'listing-id' }),
    })).rejects.toThrow('not found')
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
