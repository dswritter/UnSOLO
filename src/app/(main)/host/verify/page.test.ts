import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ status: vi.fn(), payout: vi.fn(), redirect: vi.fn() }))
vi.mock('@/actions/verification', () => ({ checkVerificationStatus: mocks.status }))
vi.mock('@/actions/payout', () => ({ getPayoutDetails: mocks.payout }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('./HostVerifyClient', () => ({ HostVerifyClient: () => null }))
import HostVerifyPage from './page'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
})

describe('verification page bootstrap', () => {
  it('starts both loaders together and passes ready data to the first render', async () => {
    let finishStatus!: (value: unknown) => void
    let finishPayout!: (value: unknown) => void
    mocks.status.mockReturnValue(new Promise(resolve => { finishStatus = resolve }))
    mocks.payout.mockReturnValue(new Promise(resolve => { finishPayout = resolve }))
    const pending = HostVerifyPage()
    expect(mocks.status).toHaveBeenCalledOnce()
    expect(mocks.payout).toHaveBeenCalledOnce()
    const status = { isHost: true }
    const payout = { upi_id: 'host@bank' }
    finishStatus(status)
    finishPayout(payout)
    const page = await pending
    expect(page.props).toEqual({ status, initialPayout: payout })
  })
  it('redirects signed-out visitors with a return URL', async () => {
    mocks.status.mockResolvedValue(null)
    mocks.payout.mockResolvedValue({ error: 'Not authenticated' })
    await expect(HostVerifyPage()).rejects.toThrow('redirect:/login?redirectTo=/host/verify')
  })
  it('does not hide payout read failures as an empty setup', async () => {
    mocks.status.mockResolvedValue({ isHost: true })
    mocks.payout.mockResolvedValue({ error: 'Payout read failed' })
    await expect(HostVerifyPage()).rejects.toThrow('Payout read failed')
  })
})
