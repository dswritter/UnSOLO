// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearSession: vi.fn(), clearQueries: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  local: vi.fn(), revoke: vi.fn(), error: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock('@/components/layout/AuthProvider', () => ({ useAuth: () => ({ clearLocalSession: mocks.clearSession }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: mocks.clearQueries }) }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mocks.local, admin: { signOut: mocks.revoke } } }),
}))
import { useSignOut } from './useSignOut'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clearSession.mockReturnValue('captured-access-token')
  mocks.local.mockResolvedValue({ error: null })
  mocks.revoke.mockResolvedValue({ error: null })
})

describe('immediate sign-out', () => {
  it('clears identity, cookies and private query data before waiting for auth work', async () => {
    let finish!: (value: { error: null }) => void
    mocks.local.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(useSignOut)
    let pending!: Promise<void>
    act(() => { pending = result.current() })
    expect(mocks.clearSession).toHaveBeenCalledOnce()
    expect(mocks.clearQueries).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/')
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.revoke).not.toHaveBeenCalled()
    finish({ error: null })
    await pending
    expect(mocks.revoke).toHaveBeenCalledWith('captured-access-token', 'local')
  })
  it('does not hide backend failures or restore the local session', async () => {
    mocks.revoke.mockResolvedValue({ error: { status: 503, message: 'Offline' } })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(useSignOut)
      await act(async () => { await result.current() })
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Signed out on this device'),
        expect.objectContaining({ action: expect.objectContaining({ label: 'Retry' }) }))
      mocks.revoke.mockResolvedValue({ error: null })
      mocks.error.mock.calls[0][1].action.onClick()
      await waitFor(() => expect(mocks.revoke).toHaveBeenCalledTimes(2))
      expect(mocks.clearSession).toHaveBeenCalledOnce()
    } finally { errorLog.mockRestore() }
  })
  it('coalesces repeated clicks while sign-out is pending', async () => {
    let finish!: (value: { error: null }) => void
    mocks.local.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(useSignOut)
    const first = result.current()
    expect(result.current()).toBe(first)
    expect(mocks.clearSession).toHaveBeenCalledOnce()
    finish({ error: null })
    await first
  })
})
