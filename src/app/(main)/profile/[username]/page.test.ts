import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDynamicParam } from 'next/dist/shared/lib/router/utils/get-dynamic-param'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), unlinkedHref: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), auth: vi.fn(),
}))
vi.mock('@/lib/profile/public-host-profile', () => ({
  findPublicProfile: mocks.profile, findUnlinkedHostProfileHref: mocks.unlinkedHref,
}))
vi.mock('@/lib/auth/request-session', () => ({ getRequestAuth: mocks.auth }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/components/profile/ProfileV2Shell', () => ({ ProfileV2Shell: () => null }))
vi.mock('./ProfileUsernameDetail', () => ({ ProfileUsernameDetail: () => null }))
vi.mock('@/components/profile/ProfilePublicSkeleton', () => ({ ProfilePublicSkeleton: () => null }))
import ProfilePage from './page'

function routeParams(username: string) {
  const segment = getDynamicParam({ username }, 'username', 'd', null, null)
  return Promise.resolve({ username: String(segment.value) })
}
const params = routeParams('strangers tribe')
beforeEach(() => {
  vi.resetAllMocks()
  const settings = { in: vi.fn().mockResolvedValue({ data: [] }) }
  mocks.auth.mockResolvedValue({
    user: null, supabase: { from: () => ({ select: () => settings }) },
  })
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
  mocks.notFound.mockImplementation(() => { throw new Error('not found') })
})

describe('profile route host resolution', () => {
  it('renders an existing spaced username without a redirect or 404', async () => {
    mocks.profile.mockResolvedValue({ profile: { username: 'strangers tribe' }, ambiguous: false })
    await expect(ProfilePage({ params })).resolves.toBeDefined()
    expect(mocks.profile).toHaveBeenCalledWith('strangers tribe')
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
  it.each(['host%20name', 'host%name', 'host/#?', 'हिमालय यात्री'])(
    'decodes %s exactly once without changing the stored username',
    async username => {
      mocks.profile.mockResolvedValue({ profile: { username }, ambiguous: false })
      await expect(ProfilePage({ params: routeParams(username) })).resolves.toBeDefined()
      expect(mocks.profile).toHaveBeenCalledWith(username)
      expect(mocks.redirect).not.toHaveBeenCalled()
    },
  )
  it('returns not found for malformed URL encoding before querying profiles', async () => {
    await expect(ProfilePage({
      params: Promise.resolve({ username: '%E0%A4%A' }),
    })).rejects.toThrow('not found')
    expect(mocks.profile).not.toHaveBeenCalled()
  })
  it('redirects a host display-name link to the actual account username', async () => {
    mocks.profile.mockResolvedValue({ profile: { username: 'strangers_tribe' }, ambiguous: false })
    await expect(ProfilePage({ params })).rejects.toThrow('redirect:/profile/strangers_tribe')
    expect(mocks.unlinkedHref).not.toHaveBeenCalled()
  })
  it('redirects a host without an account to their public listing-scoped profile', async () => {
    mocks.profile.mockResolvedValue({ profile: null, ambiguous: false })
    mocks.unlinkedHref.mockResolvedValue('/hosts/trip/public-id')
    await expect(ProfilePage({ params })).rejects.toThrow('redirect:/hosts/trip/public-id')
    expect(mocks.unlinkedHref).toHaveBeenCalledWith('strangers tribe')
  })
  it('keeps genuinely missing or ambiguous names not found', async () => {
    mocks.profile.mockResolvedValue({ profile: null, ambiguous: false })
    mocks.unlinkedHref.mockResolvedValue(null)
    await expect(ProfilePage({ params })).rejects.toThrow('not found')
  })
  it('does not redirect an ambiguous account name to a different unlinked host', async () => {
    mocks.profile.mockResolvedValue({ profile: null, ambiguous: true })
    mocks.unlinkedHref.mockResolvedValue('/hosts/trip/different-host')
    await expect(ProfilePage({ params })).rejects.toThrow('not found')
    expect(mocks.unlinkedHref).not.toHaveBeenCalled()
  })
})
