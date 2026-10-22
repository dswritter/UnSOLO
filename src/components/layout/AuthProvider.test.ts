// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  profile: vi.fn(), clearCookies: vi.fn(),
}))
vi.mock('@/lib/supabase/clear-browser-session', () => ({ clearBrowserSession: mocks.clearCookies }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { onAuthStateChange: (callback: typeof mocks.callback) => {
      mocks.callback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    } },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  }),
}))
import { AuthProvider, useAuth } from './AuthProvider'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', window.sessionStorage)
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('auth sign-out race protection', () => {
  it('does not restore a profile whose request completes after sign-out', async () => {
    let finish!: (value: { data: { id: string }; error: null }) => void
    mocks.profile.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(useAuth, {
      wrapper: ({ children }) => createElement(AuthProvider, null, children),
    })
    const session = { access_token: 'token', user: { id: 'user-1' } } as Session
    act(() => { mocks.callback?.('INITIAL_SESSION', session) })
    expect(result.current.userId).toBe('user-1')
    let token: string | null = null
    act(() => { token = result.current.clearLocalSession() })
    expect(token).toBe('token')
    expect(mocks.clearCookies).toHaveBeenCalledOnce()
    expect(result.current).toMatchObject({ userId: null, profile: null, loading: false })
    act(() => { mocks.callback?.('INITIAL_SESSION', session) })
    expect(result.current.userId).toBeNull()
    await act(async () => { finish({ data: { id: 'user-1' }, error: null }) })
    await waitFor(() => expect(result.current.profile).toBeNull())
    expect(localStorage.getItem('unsolo_auth_profile_v1')).toBeNull()
  })
})
