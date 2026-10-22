// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBrowserSession } from './clear-browser-session'
import { createBrowserClient } from '@supabase/ssr'

afterEach(() => vi.unstubAllEnvs())

describe('local Supabase session clearing', () => {
  it('removes all session chunks and PKCE cookies without touching other cookies', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    document.cookie = 'sb-testproject-auth-token.0=first; Path=/'
    document.cookie = 'sb-testproject-auth-token.1=second; Path=/'
    document.cookie = 'sb-testproject-auth-token-code-verifier=verifier; Path=/'
    document.cookie = 'site-theme=dark; Path=/'
    clearBrowserSession()
    expect(document.cookie).not.toContain('sb-testproject-auth-token')
    expect(document.cookie).toContain('site-theme=dark')
    document.cookie = 'site-theme=; Path=/; Max-Age=0'
  })
  it('lets the real SDK clear locally before a separate remote revocation', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    const token = `header.${btoa(JSON.stringify({ sub: 'test-user', exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/token')) {
        return Response.json({
          access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
          user: { id: 'test-user', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
        })
      }
      return new Response(null, { status: 204 })
    })
    const client = createBrowserClient('https://testproject.supabase.co', 'test-anon-key', {
      isSingleton: false,
      global: { fetch: fetchMock },
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
    })
    try {
      const signedIn = await client.auth.signInWithPassword({ email: 'test@example.com', password: 'test-password' })
      expect(signedIn.error).toBeNull()
      expect(document.cookie).toContain('sb-testproject-auth-token')
      clearBrowserSession()
      expect(document.cookie).not.toContain('sb-testproject-auth-token')
      expect((await client.auth.signOut({ scope: 'local' })).error).toBeNull()
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/logout'))).toHaveLength(0)
      expect((await client.auth.admin.signOut(token, 'local')).error).toBeNull()
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/logout'))).toHaveLength(1)
    } finally {
      await client.auth.stopAutoRefresh()
    }
  })
})
